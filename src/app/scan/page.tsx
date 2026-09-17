"use client";

import { useCallback, useEffect, useState } from "react";
import { CameraView } from "@/components/capture/CameraView";
import { CaptureGuide } from "@/components/capture/CaptureGuide";
import { ImagePreview } from "@/components/capture/ImagePreview";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { IdentificationResult, ProductRow } from "@/lib/identification/productIdentification";
import type { OcrProgress, RecognizeResult } from "@/lib/ocr/types";
import type { EngineContext, EngineResult } from "@/engines/types";
import { VerdictScreen, type ProductIdentity } from "@/components/verdict/VerdictScreen";

type ScanStep = "front" | "back" | "review" | "analyzing" | "done";
type CategoryChoice = "gmo_food" | "oral_care";

interface Capture {
  blob: Blob;
  url: string;
}

interface ScanOutcome {
  identification: IdentificationResult;
  engineContext: EngineContext;
  engineResult: EngineResult;
  // OCR is skipped entirely on a barcode match (verified stored verdict), so
  // these are nullable.
  frontOcr: RecognizeResult | null;
  backOcr: RecognizeResult | null;
}

function captureFrom(file: Blob): Capture {
  return { blob: file, url: URL.createObjectURL(file) };
}

function firstMeaningfulLine(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length >= 2);
  return line ?? null;
}

function identityFor(
  outcome: ScanOutcome,
  front: Capture | null
): ProductIdentity {
  const product = outcome.identification.product;
  let name = product?.name ?? firstMeaningfulLine(outcome.frontOcr?.text ?? "");
  if (!name) name = "Unidentified product";
  return {
    name,
    brand: product?.brand ?? null,
    imageUrl: front?.url ?? null,
    barcode: outcome.identification.barcode ?? null,
    matchedBy: outcome.identification.identityMatch,
  };
}

export default function ScanPage() {
  const [step, setStep] = useState<ScanStep>("front");
  const [front, setFront] = useState<Capture | null>(null);
  const [back, setBack] = useState<Capture | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Category routing is FR-4 (Phase 4). Until real routing lands the user picks
  // a bucket; matched products override this. Oral care is Phase 6.
  const [category, setCategory] = useState<CategoryChoice>("gmo_food");

  const retakeFront = useCallback(() => {
    setFront((f) => {
      if (f) URL.revokeObjectURL(f.url);
      return null;
    });
    setStep("front");
  }, []);

  const retakeBack = useCallback(() => {
    setBack((b) => {
      if (b) URL.revokeObjectURL(b.url);
      return null;
    });
    setStep("back");
  }, []);

  const reset = useCallback(() => {
    setFront((f) => {
      if (f) URL.revokeObjectURL(f.url);
      return null;
    });
    setBack((b) => {
      if (b) URL.revokeObjectURL(b.url);
      return null;
    });
    setOutcome(null);
    setError(null);
    setProgress(null);
    setStep("front");
  }, []);

  // Terminate the OCR worker on flow exit.
  useEffect(() => {
    const onUnload = () => {
      void import("@/lib/ocr/tesseract").then((m) => m.terminateOcr());
    };
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      onUnload();
    };
  }, []);

  const analyze = useCallback(async () => {
    if (!front || !back) return;
    setStep("analyzing");
    setError(null);
    setProgress(null);
    try {
      // Lazy-load OCR and the engines only when the user runs the scan.
      const [
        { getOcrClient },
        { downscaleBlob },
        { identifyProduct },
        { decodeBarcode },
        { gmoEngine },
        { productToEngineResult },
      ] = await Promise.all([
        import("@/lib/ocr/tesseract"),
        import("@/lib/ocr/image"),
        import("@/lib/identification/productIdentification"),
        import("@/lib/ocr/barcode"),
        import("@/engines/gmoEngine"),
        import("@/engines/fromProduct"),
      ]);

      const supabase = getSupabaseBrowser();
      // Downscale to ~1600px long edge before recognition (§6 of the frontend arch).
      const frontImg = await downscaleBlob(front.blob);

      let identification: IdentificationResult | null = null;
      let frontOcr: RecognizeResult | null = null;
      let backOcr: RecognizeResult | null = null;

      // Tier 1 fast path: a catalogue barcode on the front image short-circuits
      // OCR + the rules engine entirely — the stored verdict wins (tier 1 skip
      // per 02_SYSTEM_ARCHITECTURE §4.1).
      const barcode = await decodeBarcode(frontImg);
      if (barcode) {
        const { data } = await supabase
          .from("products")
          .select("*")
          .eq("barcode", barcode)
          .maybeSingle();
        if (data) {
          identification = { tier: 1, identityMatch: "barcode", barcode, product: data as ProductRow };
        }
      }

      if (!identification) {
        const client = getOcrClient();
        const backImg = await downscaleBlob(back.blob);
        frontOcr = await client.recognize(frontImg, setProgress);
        backOcr = await client.recognize(backImg, setProgress);

        // Tiers 1 → 2 (barcode already in-record or not), returning early on a match.
        identification = await identifyProduct({
          frontImage: frontImg,
          frontText: frontOcr.text,
          supabase,
        });
      }

      const product = identification.product;
      const matchedBy = identification.identityMatch;

      // Populated from REAL OCR output (or flagged as skipped on a barcode win).
      const engineContext: EngineContext = {
        ocrMeanConfidence: backOcr?.meanConfidence ?? 0,
        isTruncated: backOcr?.isTruncated ?? false,
        identityMatch: matchedBy,
        category: product?.category ?? category,
        subcategory:
          product?.subcategory ?? (category === "gmo_food" ? "packaged_food" : "oral_care_product"),
      };

      // FR-6: stored verdict → EngineResult when we matched the catalogue;
      // otherwise run the rules engine on the OCR'd ingredients text.
      const engineResult: EngineResult = product
        ? productToEngineResult(product, matchedBy)
        : gmoEngine(backOcr?.text ?? "", engineContext);

      setOutcome({ identification, engineContext, engineResult, frontOcr, backOcr });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("review");
    }
  }, [front, back, category]);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <h1 className="text-xl font-semibold">Scan a product</h1>

      {step === "front" && (
        <section className="mt-4">
          <CaptureGuide step="front" />
          <CameraView
            facing="front"
            onCapture={(blob) => {
              setFront(captureFrom(blob));
              setStep("back");
            }}
            onUpload={(file) => {
              setFront(captureFrom(file));
              setStep("back");
            }}
          />
        </section>
      )}

      {step === "back" && (
        <section className="mt-4">
          <CaptureGuide step="back" />
          <CameraView
            facing="back"
            onCapture={(blob) => {
              setBack(captureFrom(blob));
              setStep("review");
            }}
            onUpload={(file) => {
              setBack(captureFrom(file));
              setStep("review");
            }}
          />
        </section>
      )}

      {step === "review" && (
        <section className="mt-4 space-y-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          {front && <ImagePreview src={front.url} label="Front label" onRetake={retakeFront} />}
          {back && <ImagePreview src={back.url} label="Ingredients" onRetake={retakeBack} />}
          <button
            type="button"
            onClick={() => void analyze()}
            className="h-12 w-full rounded-full bg-zinc-900 text-base font-medium text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Analyze labels
          </button>
        </section>
      )}

      {step === "analyzing" && (
        <section className="mt-6 space-y-3 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200" aria-live="polite">
            {progress?.label ?? "Preparing OCR…"}
          </p>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
            role="progressbar"
            aria-valuenow={Math.round((progress?.progress ?? 0) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-zinc-900 transition-[width] duration-200 dark:bg-zinc-50"
              style={{ width: `${Math.round((progress?.progress ?? 0) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {Math.round((progress?.progress ?? 0) * 100)}%
          </p>
        </section>
      )}

      {step === "done" && outcome && (
        <section className="mt-4 space-y-6">
          <VerdictScreen
            result={outcome.engineResult}
            identity={identityFor(outcome, front)}
            photo={front}
            ocrConfidence={outcome.backOcr?.meanConfidence}
            ingredientsText={outcome.backOcr?.text ?? ""}
          />

          <details className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <summary className="cursor-pointer text-sm font-medium text-zinc-600 dark:text-zinc-300">
              Engine diagnostics (Phase 3)
            </summary>
            <div className="mt-3">
              <DiagnosticPanel outcome={outcome} front={front} back={back} />
            </div>
          </details>

          <button
            type="button"
            onClick={reset}
            className="h-12 w-full rounded-full border border-zinc-300 text-base font-medium text-zinc-800 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Scan another product
          </button>
        </section>
      )}

      <footer className="mt-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
        <label htmlFor="demo-category" className="mr-2">
          Demo category (FR-4 routing is Phase 4):
        </label>
        <select
          id="demo-category"
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={category}
          onChange={(e) => setCategory(e.target.value as CategoryChoice)}
        >
          <option value="gmo_food">Food (GMO)</option>
          <option value="oral_care" disabled>
            Oral care (fluoride) — Phase 6
          </option>
        </select>
      </footer>
    </main>
  );
}

function DiagnosticPanel({
  outcome,
  front,
  back,
}: {
  outcome: ScanOutcome;
  front: Capture | null;
  back: Capture | null;
}) {
  const { frontOcr, backOcr, identification, engineContext, engineResult } = outcome;
  const matched = identification.product;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Identification (FR-2)
        </h2>
        <p className="mt-2 text-sm">
          Tier {identification.tier} ·{" "}
          <span className="font-medium">{identification.identityMatch}</span>
          {identification.barcode && (
            <span className="text-zinc-500 dark:text-zinc-400">
              {" "}
              · barcode {identification.barcode}
            </span>
          )}
          {identification.note && (
            <span className="text-zinc-500 dark:text-zinc-400"> · {identification.note}</span>
          )}
        </p>
        {matched ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-zinc-500 dark:text-zinc-400">Name</dt>
            <dd>{matched.name}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Brand</dt>
            <dd>{matched.brand ?? "—"}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Stored verdict</dt>
            <dd>{matched.result_label}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Stored confidence</dt>
            <dd>{matched.confidence_tier}</dd>
            {identification.similarity !== undefined && (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Similarity</dt>
                <dd>{identification.similarity.toFixed(3)}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            No stored match — rules engine ran on the OCR&apos;d ingredients text.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          EngineResult metadata
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-zinc-500 dark:text-zinc-400">Scoring method</dt>
          <dd>{matched ? "stored verdict (FR-6)" : `rules engine (config v${engineResult.configVersion})`}</dd>
          <dt className="text-zinc-500 dark:text-zinc-400">Computed at</dt>
          <dd>{new Date(engineResult.computedAt).toLocaleTimeString()}</dd>
          <dt className="text-zinc-500 dark:text-zinc-400">Confidence score</dt>
          <dd>{engineResult.confidence.score}</dd>
        </dl>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          EngineContext (01_TECHNICAL_SPECIFICATION §5.1)
        </h2>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-zinc-100 p-3 text-xs leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {JSON.stringify(engineContext, null, 2)}
        </pre>
        {frontOcr && backOcr && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-zinc-500 dark:text-zinc-400">Front OCR confidence</dt>
            <dd>{frontOcr.meanConfidence.toFixed(3)}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Back OCR confidence</dt>
            <dd>{backOcr.meanConfidence.toFixed(3)}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Back truncated at edge</dt>
            <dd>{backOcr.isTruncated ? "yes" : "no"}</dd>
          </dl>
        )}
        {!frontOcr && (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            OCR skipped — barcode matched a verified stored verdict.
          </p>
        )}
      </div>

      <div className="space-y-4">
        {front && frontOcr && <OcrText title="Front label text (name / brand / barcode)" ocr={frontOcr} />}
        {back && backOcr && (
          <OcrText title="Ingredients text (feeds the rules engine unless a stored verdict wins)" ocr={backOcr} />
        )}
      </div>
    </div>
  );
}

function OcrText({ title, ocr }: { title: string; ocr: RecognizeResult }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h2>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
        {ocr.text || "(no text recognised)"}
      </pre>
    </div>
  );
}