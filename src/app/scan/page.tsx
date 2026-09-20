"use client";

import { useCallback, useEffect, useSyncExternalStore, useState } from "react";
import { CameraView } from "@/components/capture/CameraView";
import { CaptureGuide } from "@/components/capture/CaptureGuide";
import { ImagePreview } from "@/components/capture/ImagePreview";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { IdentificationResult, ProductRow } from "@/lib/identification/productIdentification";
import type { OcrProgress, RecognizeResult } from "@/lib/ocr/types";
import type { EngineContext, EngineResult } from "@/engines/types";
import { VerdictScreen, type ProductIdentity } from "@/components/verdict/VerdictScreen";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  // Debug-only surfaces (demo category selector, engine diagnostics) are gated
  // behind ?debug=1 so the shipped UI never shows ephemeral controls.
  const debugMode = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).has("debug"),
    () => false
  );

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
    <PageContainer className="pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <PageHeader title="Scan a product" />

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
            <InlineAlert variant="destructive">{error}</InlineAlert>
          )}
          {front && <ImagePreview src={front.url} label="Front label" onRetake={retakeFront} />}
          {back && <ImagePreview src={back.url} label="Ingredients" onRetake={retakeBack} />}
          <Button type="button" size="lg" className="w-full" onClick={() => void analyze()}>
            Analyze labels
          </Button>
        </section>
      )}

      {step === "analyzing" && (
        <Panel variant="elevated" className="mt-6 space-y-3">
          <p className="text-sm font-medium" aria-live="polite">
            {progress?.label ?? "Preparing OCR…"}
          </p>
          <Progress value={Math.round((progress?.progress ?? 0) * 100)} aria-label="OCR progress" />
          <p className="text-xs text-muted-foreground">
            {Math.round((progress?.progress ?? 0) * 100)}%
          </p>
        </Panel>
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

          {debugMode && (
            <Panel variant="hairline">
              <details className="[&>summary]:cursor-pointer [&>summary]:text-sm [&>summary]:font-medium [&>summary]:text-muted-foreground">
                <summary>Engine diagnostics</summary>
                <div className="mt-3">
                  <DiagnosticPanel outcome={outcome} front={front} back={back} />
                </div>
              </details>
            </Panel>
          )}

          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={reset}
          >
            Scan another product
          </Button>
        </section>
      )}

      {debugMode && (
        <footer className="mt-8 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <span>Demo category (FR-4 routing is Phase 4):</span>
          <Select
            value={category}
            onValueChange={(value) => setCategory(value as CategoryChoice)}
          >
            <SelectTrigger id="demo-category" aria-label="Demo category" className="h-9 w-fit text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gmo_food">Food (GMO)</SelectItem>
              <SelectItem value="oral_care" disabled>
                Oral care (fluoride) — Phase 6
              </SelectItem>
            </SelectContent>
          </Select>
        </footer>
      )}
    </PageContainer>
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
      <Panel variant="inset">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Identification (FR-2)
        </h2>
        <p className="mt-2 text-sm">
          Tier {identification.tier} ·{" "}
          <span className="font-medium">{identification.identityMatch}</span>
          {identification.barcode && (
            <span className="text-muted-foreground">
              {" "}
              · barcode {identification.barcode}
            </span>
          )}
          {identification.note && (
            <span className="text-muted-foreground"> · {identification.note}</span>
          )}
        </p>
        {matched ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{matched.name}</dd>
            <dt className="text-muted-foreground">Brand</dt>
            <dd>{matched.brand ?? "—"}</dd>
            <dt className="text-muted-foreground">Stored verdict</dt>
            <dd>{matched.result_label}</dd>
            <dt className="text-muted-foreground">Stored confidence</dt>
            <dd>{matched.confidence_tier}</dd>
            {identification.similarity !== undefined && (
              <>
                <dt className="text-muted-foreground">Similarity</dt>
                <dd>{identification.similarity.toFixed(3)}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No stored match — rules engine ran on the OCR&apos;d ingredients text.
          </p>
        )}
      </Panel>

      <Panel variant="inset">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          EngineResult metadata
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Scoring method</dt>
          <dd>{matched ? "stored verdict (FR-6)" : `rules engine (config v${engineResult.configVersion})`}</dd>
          <dt className="text-muted-foreground">Computed at</dt>
          <dd>{new Date(engineResult.computedAt).toLocaleTimeString()}</dd>
          <dt className="text-muted-foreground">Confidence score</dt>
          <dd>{engineResult.confidence.score}</dd>
        </dl>
      </Panel>

      <Panel variant="inset">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          EngineContext (01_TECHNICAL_SPECIFICATION §5.1)
        </h2>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-muted p-3 text-xs leading-relaxed">
          {JSON.stringify(engineContext, null, 2)}
        </pre>
        {frontOcr && backOcr && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Front OCR confidence</dt>
            <dd>{frontOcr.meanConfidence.toFixed(3)}</dd>
            <dt className="text-muted-foreground">Back OCR confidence</dt>
            <dd>{backOcr.meanConfidence.toFixed(3)}</dd>
            <dt className="text-muted-foreground">Back truncated at edge</dt>
            <dd>{backOcr.isTruncated ? "yes" : "no"}</dd>
          </dl>
        )}
        {!frontOcr && (
          <p className="mt-3 text-sm text-muted-foreground">
            OCR skipped — barcode matched a verified stored verdict.
          </p>
        )}
      </Panel>

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
    <Panel variant="hairline">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed">
        {ocr.text || "(no text recognised)"}
      </pre>
    </Panel>
  );
}