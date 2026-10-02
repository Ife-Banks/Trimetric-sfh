"use client";

// Scan flow — capture → analyze → verdict, against the 11 tagged fluoride
// screens (Capture, Analyze, Diagnostic results, Unverified, Add, Thanks).
// Routing stays deterministic: OCR product-name match → stored verdict;
// otherwise the single rules engine for the route
// bucket — never both. Verified matches go straight to DiagnosticResult; cold
// starts stop at UnverifiedScreen first, with the provisional result a tap away
// and the contribution loop (Add → Thanks) as the primary action.

import { Suspense, useCallback, useEffect, useMemo, useRef, useSyncExternalStore, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { CameraView } from "@/components/capture/CameraView";
import { StepProgressHeader } from "@/components/capture/StepProgressHeader";
import { ImagePreview } from "@/components/capture/ImagePreview";
import { AnalyzeScreen } from "@/components/capture/AnalyzeScreen";
import {
  DiagnosticResult,
  type ProductIdentity,
} from "@/components/diagnostic/DiagnosticResult";
import { UnverifiedScreen } from "@/components/diagnostic/UnverifiedScreen";
import { AddProductScreen } from "@/components/diagnostic/AddProductScreen";
import { ThanksScreen } from "@/components/diagnostic/ThanksScreen";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { loadLookupConfig, type FluorideLookupConfig, type LookupConfig } from "@/lib/config/lookupConfig";
import { readDefaultCategory } from "@/lib/preferences";
import { isFrontPanelReadable, type IdentificationResult } from "@/lib/identification/productIdentification";
// Static import: PipelineError is a tiny leaf class and needs to be in scope
// in the catch block so its user-facing message is shown verbatim.
import { PipelineError } from "@/lib/scan/pipeline";
import { receiptFrom, recordScan } from "@/lib/scanHistory";
import type { OcrProgress, RecognizeResult } from "@/lib/ocr/types";
import type { EngineContext, EngineResult } from "@/engines/types";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Panel } from "@/components/ui/panel";
import { cn } from "cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ScanStep = "front" | "back" | "review" | "analyzing" | "done" | "provisional" | "add" | "thanks";
type CategoryChoice = "gmo_food" | "oral_care";

// URL contract for the category hub cards (guest-dashboard, onboarding):
// /scan?category=gmo  → gmo_food   /scan?category=fluoride → oral_care.
function categoryFromParam(value: string | null): CategoryChoice {
  return value === "fluoride" || value === "oral_care" ? "oral_care" : "gmo_food";
}

// Cold-start oral-care routing (config §5): reuse the published keyword lists
// over BOTH the front and back OCR text — the front label is where
// "toothpaste" / "mouthwash" usually appears. Returns "" when unresolved so the
// engine applies its own tooth/gel fallback (capped at Medium, never guessed
// High). "note" and "fallback" keys are doc-only strings and are skipped.
function detectOralCareSubcategory(
  frontText: string,
  backText: string,
  config: FluorideLookupConfig
): string {
  const text = `${frontText}\n${backText}`.toLowerCase()
  const known = new Set(Object.keys(config.category_ppm_tables))
  for (const [key, keywords] of Object.entries(config.subcategory_detection)) {
    if (!Array.isArray(keywords) || typeof keywords[0] !== "string") continue
    const subcat = key.endsWith("_keywords") ? key.slice(0, -"_keywords".length) : key
    if (!known.has(subcat)) continue
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) return subcat
    }
  }
  return ""
}

interface Capture {
  blob: Blob;
  url: string;
}

interface ScanOutcome {
  identification: IdentificationResult;
  engineContext: EngineContext;
  engineResult: EngineResult;
  // These are nullable only until OCR has completed.
  frontOcr: RecognizeResult | null;
  backOcr: RecognizeResult | null;
  lookupConfig: LookupConfig | null;
}

function captureFrom(file: Blob): Capture {
  return { blob: file, url: URL.createObjectURL(file) };
}

function firstMeaningfulLine(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length >= 3 && /[a-z]{3}/i.test(l));
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
    barcode: null,
    matchedBy: outcome.identification.identityMatch,
    similarity: outcome.identification.similarity,
  };
}

function ScanPage() {
  const router = useRouter();
  const [step, setStep] = useState<ScanStep>("front");
  const [front, setFront] = useState<Capture | null>(null);
  const [back, setBack] = useState<Capture | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [pipelineStage, setPipelineStage] = useState(0);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [submittedProduct, setSubmittedProduct] = useState<{ productName: string; brand: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const urlCategory = searchParams.get("category");
  // Category routing is FR-4. The hub cards deep-link ?category=gmo|fluoride;
  // matched catalogue products override whatever bucket the user lands in.
  // Oral care selects the fluoride engine (Phase 6 shipped). Derived straight
  // from the URL — the debug selector rewrites the param instead of holding
  // parallel state, so one value of truth drives the scan. When no param is
  // present, /scan resolves the Diagnostic Preference from Settings into the
  // URL on mount (the effect navigates, not setState).
  useEffect(() => {
    if (!window.location.search.includes("category=") && readDefaultCategory() === "fluoride") {
      router.replace("/scan?category=fluoride");
    }
  }, [router]);
  const category: CategoryChoice = categoryFromParam(urlCategory);

  // The tab bar now stays up on EVERY step, the viewfinder and analyzing screen
  // included — the bar is always visible across the app, so abandoning a scan
  // mid-capture can never strand the user without navigation.

  // Debug-only surfaces (demo category selector, engine diagnostics) are gated
  // behind ?debug=1 so the shipped UI never shows ephemeral controls.
  const debugMode = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).has("debug"),
    () => false
  );

  // Object URLs are revoked outside the state updater. Calling
  // revokeObjectURL inside a useState updater is a documented anti-pattern —
  // React may invoke updaters more than once (StrictMode, re-entrant replay),
  // so a side effect placed there can fire unpredictably.
  const retakeFront = useCallback(() => {
    setFront((f) => {
      if (f) queueMicrotask(() => URL.revokeObjectURL(f.url));
      return null;
    });
    setStep("front");
  }, []);

  const retakeBack = useCallback(() => {
    setBack((b) => {
      if (b) queueMicrotask(() => URL.revokeObjectURL(b.url));
      return null;
    });
    setStep("back");
  }, []);

  const reset = useCallback(() => {
    setFront((f) => {
      if (f) queueMicrotask(() => URL.revokeObjectURL(f.url));
      return null;
    });
    setBack((b) => {
      if (b) queueMicrotask(() => URL.revokeObjectURL(b.url));
      return null;
    });
    setOutcome(null);
    setError(null);
    setProgress(null);
    setReference(null);
    setSubmittedProduct(null);
    setStep("front");
  }, []);

  // Mirror the current object URLs so unmount can release them without calling
  // setState (a no-op during unmount anyway). Object URLs are only freed by an
  // explicit revoke, so without this, navigating away mid-flow (ThanksScreen
  // "Done", sign-out, the header back arrow) leaked both blobs for the lifetime
  // of the document.
  const frontUrlRef = useRef<string | null>(null);
  const backUrlRef = useRef<string | null>(null);

  useEffect(() => {
    frontUrlRef.current = front?.url ?? null;
  }, [front]);
  useEffect(() => {
    backUrlRef.current = back?.url ?? null;
  }, [back]);

  useEffect(() => {
    return () => {
      if (frontUrlRef.current) URL.revokeObjectURL(frontUrlRef.current);
      if (backUrlRef.current) URL.revokeObjectURL(backUrlRef.current);
    };
  }, []);

  // File the receipt for signed-in users once per outcome. Done here rather than
  // inside analyze() so a manual catalogue match is recorded too — and guarded by
  // a ref on the outcome object itself so a re-render, or React invoking the
  // effect twice in development, cannot file the same scan twice.
  const recordedRef = useRef<ScanOutcome | null>(null);
  useEffect(() => {
    if (!outcome || recordedRef.current === outcome) return;
    recordedRef.current = outcome;
    const matched = outcome.identification.product;
    void recordScan(
      receiptFrom({
        engineResult: outcome.engineResult,
        identityMatch: outcome.identification.identityMatch,
        productId: matched?.id ?? null,
        productName: matched?.name ?? firstMeaningfulLine(outcome.frontOcr?.text ?? ""),
        brand: matched?.brand ?? null,
      })
    );
  }, [outcome]);

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
    setPipelineStage(0);
    try {
      // Lazy-load OCR and the identification/pipeline modules only when the user
      // runs the scan — none of this belongs in the initial bundle.
      const [{ getOcrClient }, { prepareBlobForOcr }, { identifyProduct }] = await Promise.all([
        import("@/lib/ocr/tesseract"),
        import("@/lib/ocr/image"),
        import("@/lib/identification/productIdentification"),
      ]);

      const supabase = getSupabaseBrowser();
      // Downscale to ~1600px long edge and level any tilt before recognition
      // (§6 of the frontend arch). Tilt correction is the part that matters: a
      // label shot a few degrees off level can return ZERO characters while the
      // identical image rotated flat reads cleanly. See lib/ocr/deskew.ts.
      const frontOcrImage = await prepareBlobForOcr(front.blob);
      const backOcrImage = await prepareBlobForOcr(back.blob);
      console.log(
        `[scan] prep · skew · front ${frontOcrImage.skewAngle.toFixed(2)}° · back ${backOcrImage.skewAngle.toFixed(2)}°`
      );
      let identification: IdentificationResult | null = null;
      let frontOcr: RecognizeResult | null = null;
      let backOcr: RecognizeResult | null = null;

      const client = getOcrClient();
      setPipelineStage(1); // reading product name
      frontOcr = await client.recognize(frontOcrImage.blob, setProgress);
      setPipelineStage(2); // reading ingredients
      backOcr = await client.recognize(backOcrImage.blob, setProgress);

      // OCR is the most likely place for a scan to go wrong, and a verdict screen
      // cannot tell you so: "couldn't find this product" looks identical whether
      // the label was read perfectly and is absent from the catalogue, or the
      // front panel came back as noise. These six numbers separate the two.
      for (const [panel, ocr] of [
        ["front (product name)", frontOcr],
        ["back (ingredients)", backOcr],
      ] as const) {
        console.log(
          `[scan] ocr · ${panel} · confidence ${ocr.meanConfidence.toFixed(3)}` +
            ` · ${ocr.text.length} chars · ${ocr.text.trim() ? `${ocr.text.trim().split(/\s+/).length} words` : "0 words"}` +
            ` · ${ocr.isTruncated ? "TRUNCATED" : "complete"}`
        );
        console.log(`[scan] ocr · ${panel} text:`, ocr.text || "(empty)");
        if (!ocr.text.trim()) {
          console.error(
            `[scan] ocr · ${panel} returned NO TEXT. Everything downstream is meaningless — retake with the panel filling the frame, flat and well lit.`
          );
        } else if (ocr.meanConfidence < 0.6) {
          console.warn(
            `[scan] ocr · ${panel} confidence ${ocr.meanConfidence.toFixed(3)} is below the 0.6 penalty threshold — the verdict will be capped at low confidence and names may be misread.`
          );
        }
      }

      setProgress(null);
      setPipelineStage(3); // verifying fluoride levels / identifying product
      identification = await identifyProduct({
        frontText: frontOcr.text,
        category,
        supabase,
      });

      setPipelineStage(4); // loading the active ruleset / scoring verdict
      // Always load the published ruleset, even when a stored verdict will be
      // used. It was previously skipped on a catalogue match, which left
      // `outcome.lookupConfig` null and forced an `as LookupConfig` cast at the
      // AddProductScreen call site — where `SubmissionForm` does
      // `"certification_short_circuit" in lookupConfig`, so a null there is a
      // TypeError with no error boundary. The correction CTA is now offered on
      // verified low-confidence results too, so this path is reachable.
      const lookupConfig = await loadLookupConfig(supabase, category)

      // Deliberately shape-agnostic: the GMO and fluoride rulesets have entirely
      // different keys (explicit_crop_matches vs terms_lookup_table), and a log
      // line that assumed one of them would read `undefined` for the other —
      // which is exactly the kind of false signal that wastes an afternoon.
      console.log(
        `[scan] ruleset · ${category} · config v${lookupConfig.version} · keys: ${Object.keys(lookupConfig).length}`
      );

      // The deterministic half of the scan lives in lib/scan/pipeline.ts so it
      // is testable without a camera or a network. It builds the EngineContext,
      // short-circuits to a stored catalogue verdict, and routes to exactly one
      // engine.
      const { runScanPipeline } = await import("@/lib/scan/pipeline")
      const { engineResult, engineContext } = runScanPipeline({
        category,
        frontText: frontOcr.text,
        backText: backOcr.text,
        front: frontOcr,
        back: backOcr,
        identification,
        lookupConfig,
        detectOralCareSubcategory: (frontText, backText, config) =>
          detectOralCareSubcategory(frontText, backText, config),
      })

      console.log(
        `[scan] result · ${identification.identityMatch === "none" ? "NO CATALOGUE MATCH" : `matched "${identification.product?.name}" @ ${identification.similarity?.toFixed(3)}`}` +
          ` · ${engineResult.result.label}` +
          ` · confidence ${engineResult.confidence.tier} (${engineResult.confidence.score})` +
          ` · ${engineResult.matchedTerms.length} matched term(s)`
      );
      if (identification.identityMatch === "none") {
        console.warn(
          "[scan] result · the rules engine still ran and produced the verdict above. " +
            "If the product IS in the database, the cause is upstream of the database: " +
            "check the front-panel OCR text logged above against the stored product name."
        );
      }

      setOutcome({ identification, engineContext, engineResult, frontOcr, backOcr, lookupConfig });
      setStep("done");
    } catch (err) {
      // Surface a PipelineError's own message (it is written for the user);
      // anything else gets a generic-but-actionable fallback rather than a
      // raw exception string.
      setError(
        err instanceof PipelineError
          ? err.message
          : err instanceof Error && err.message
            ? err.message
            : "The scan could not be completed. Please try again."
      );
      setStep("review");
    }
  }, [front, back, category]);

  const identity = useMemo(() => (outcome ? identityFor(outcome, front) : null), [outcome, front]);
  const verified = outcome?.identification.identityMatch !== "none";

  const searchCatalogueManually = useCallback(async (productName: string) => {
    if (!outcome) return false;
    const [{ identifyProduct }, { productToEngineResult }] = await Promise.all([
      import("@/lib/identification/productIdentification"),
      import("@/engines/fromProduct"),
    ]);
    const identification = await identifyProduct({
      frontText: productName,
      category,
      supabase: getSupabaseBrowser(),
    });
    if (!identification.product) return false;

    const product = identification.product;
    setOutcome((current) => current ? {
      ...current,
      identification,
      engineContext: {
        ...current.engineContext,
        category: product.category,
        subcategory: product.subcategory,
        identityMatch: "name",
        identitySimilarity: identification.similarity,
      },
      engineResult: productToEngineResult(
        product,
        "name",
        identification.similarity,
        current.engineContext.ocrMeanConfidence
      ),
    } : current);
    return true;
  }, [outcome, category]);

  return (
    <PageContainer
      className={
        // No `min-h-dvh` on the full-bleed steps: PageContainer is `flex-1`
        // inside the app shell, which already fills the viewport minus the tab
        // bar's reserved height. `min-h-dvh` measured the container against the
        // WHOLE viewport, so with the bar's 64px spacer after it the document
        // came out 64px too tall and every capture step scrolled.
        step === "front" || step === "back" || step === "analyzing"
          ? cn("mx-auto w-full max-w-[402px] px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ink", step === "analyzing" && category === "oral_care" ? "bg-gradient-to-b from-mint-start via-brand-wash to-brand-wash" : "bg-surface")
          : (step === "done" || step === "provisional") && category === "oral_care"
            ? "mx-auto w-full max-w-[402px] bg-gradient-to-b from-mint-start via-brand-wash to-brand-wash px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ink"
          : "pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      }
    >
      {(step === "front" || step === "back") ? (
        <>
          <header className="flex h-10 items-center gap-3 border-b border-surface-hairline">
            <button
              type="button"
              aria-label={step === "front" ? "Back to dashboard" : "Retake front label"}
              onClick={() => step === "front" ? router.push("/guest-dashboard") : retakeFront()}
              className="flex size-11 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-inset"
            >
              <ArrowLeft className="size-5" />
            </button>
            <span className="text-[14px] font-semibold">{category === "oral_care" ? "Scan Oral Care" : "Scan Product"}</span>
          </header>
        </>
      ) : step === "analyzing" || step === "done" || step === "provisional" || step === "add" ? null : (
        <PageHeader title={category === "oral_care" ? "Scan oral care" : "Scan a product"} />
      )}

      {(step === "front" || step === "back") && (
        <section className="mt-3 space-y-3">
          <StepProgressHeader
            step={step === "front" ? 1 : 2}
            label={step === "front" ? "Package Front" : category === "oral_care" ? "Fluoride Ingredients" : "Ingredients & Nutrition"}
          />
          <div>
            <h1 className="text-[20px] font-bold leading-6 tracking-[-0.4px] text-ink">
              {step === "front" ? "Capture the front" : "Capture the back"}
            </h1>
            <p className="mt-1 max-w-[360px] text-[12px] leading-[17px] text-ink-muted">
              {step === "front"
                ? category === "oral_care"
                  ? "Frame the product name, brand, and fluoride claims inside the guides."
                  : "Frame the brand logo, product title, and organic certifications inside the guides."
                : category === "oral_care"
                  ? "Make sure the active ingredients and fluoride concentration are clearly visible. Keep the label flat and lit."
                  : "Make sure the ingredients list, certifications, and product details are clearly visible. Keep the label flat and lit."}
            </p>
          </div>
          <CameraView
            // Remount per step. One CameraView serves both the front and back
            // label, and its internal status/error/stream state must not leak
            // from one to the other — a remount gives the next label a clean
            // start without needing an effect to reset it.
            key={step}
            facing={step}
            onCapture={(blob) => {
              if (step === "front") {
                setFront(captureFrom(blob));
                setStep("back");
              } else {
                setBack(captureFrom(blob));
                setStep("review");
              }
            }}
            onUpload={(file) => {
              if (step === "front") {
                setFront(captureFrom(file));
                setStep("back");
              } else {
                setBack(captureFrom(file));
                setStep("review");
              }
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
        <div className={cn(category === "oral_care" ? "mt-2" : "mt-6")}>
          <AnalyzeScreen category={category} stage={pipelineStage} progress={progress} />
        </div>
      )}

      {step === "done" && outcome && identity && (
        verified ? (
          <section className="mt-4">
            <DiagnosticResult
              result={outcome.engineResult}
              identity={identity}
              photo={front}
              engineContext={outcome.engineContext}
              onRescan={reset}
              onAddProduct={() => setStep("add")}
              onBack={reset}
            />
            {debugMode && <DiagnosticPanel outcome={outcome} front={front} back={back} />}
          </section>
        ) : (
          <section className="mt-4">
            <UnverifiedScreen
              identity={identity}
              result={outcome.engineResult}
              engineContext={outcome.engineContext}
              photoUrl={front?.url}
              frontPanelReadable={isFrontPanelReadable(outcome.frontOcr?.text ?? "")}
              onRescan={reset}
              onViewResult={() => setStep("provisional")}
              onAddProduct={() => setStep("add")}
              onManualSearch={searchCatalogueManually}
            />
            {debugMode && <DiagnosticPanel outcome={outcome} front={front} back={back} />}
          </section>
        )
      )}

      {step === "provisional" && outcome && identity && (
        <section className="mt-4">
          <DiagnosticResult
            result={outcome.engineResult}
            identity={identity}
            photo={front}
            engineContext={outcome.engineContext}
            onRescan={reset}
            onAddProduct={() => setStep("add")}
            onBack={() => setStep("done")}
          />
          {debugMode && <DiagnosticPanel outcome={outcome} front={front} back={back} />}
        </section>
      )}

      {step === "add" && outcome && identity && outcome.lookupConfig && (
        <section className="mt-4">
          <AddProductScreen
            result={outcome.engineResult}
            lookupConfig={outcome.lookupConfig}
            prefill={{
              productName: identity.name === "Unidentified product" ? "" : identity.name,
              brand: identity.brand ?? "",
              ingredientsText: outcome.backOcr?.text ?? "",
              barcode: identity.barcode,
            }}
            photo={back}
            frontPhoto={front}
            ocrConfidence={outcome.backOcr?.meanConfidence}
            onBack={() => setStep("done")}
            onDone={(ref, product) => {
              setReference(ref);
              setSubmittedProduct(product);
              setStep("thanks");
            }}
          />
        </section>
      )}

      {step === "thanks" && reference && (
        <section className="mt-4">
          <ThanksScreen
            reference={reference}
            productName={submittedProduct?.productName ?? identity?.name ?? "Submitted product"}
            brand={submittedProduct?.brand ?? identity?.brand ?? ""}
            category={outcome?.engineResult.category ?? category}
            photoUrl={front?.url}
            onAnother={reset}
            onDone={() => router.push("/guest-dashboard")}
          />
        </section>
      )}

      {debugMode && (
        <footer className="mt-8 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <span>Demo category (FR-4 routing):</span>
          <Select
            value={category}
            onValueChange={(value) =>
              router.replace(value === "gmo_food" ? "/scan?category=gmo" : "/scan?category=fluoride")
            }
          >
            <SelectTrigger id="demo-category" aria-label="Demo category" className="h-9 w-fit text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gmo_food">Food (GMO)</SelectItem>
              <SelectItem value="oral_care">Oral care (fluoride)</SelectItem>
            </SelectContent>
          </Select>
        </footer>
      )}
    </PageContainer>
  );
}

function ScanRoute() {
  return (
    <Suspense fallback={null}>
      <ScanPage />
    </Suspense>
  );
}

export default ScanRoute;

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
        <h2 className="text-overline uppercase text-muted-foreground">
          Identification (FR-2)
        </h2>
        <p className="mt-2 text-sm">
          Name lookup ·{" "}
          <span className="font-medium">{identification.identityMatch}</span>
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
        <h2 className="text-overline uppercase text-muted-foreground">
          Catalogue lookup attempts
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every string sent to <code>search_products_by_name</code>, in order. When
          nothing matches, this is what separates &ldquo;OCR read the wrong
          words&rdquo; from &ldquo;the catalogue does not have this product&rdquo;.
        </p>
        {identification.attempts && identification.attempts.length > 0 ? (
          <div className="mt-3 space-y-1 text-xs">
            {identification.attempts.map((attempt, i) => (
              <div
                key={i}
                className="rounded border border-border/60 bg-surface px-2 py-1.5 font-mono"
              >
                <span className="text-muted-foreground">try {i + 1}:</span>{" "}
                <span className="break-all">{attempt.candidate}</span>
                <br />
                {attempt.error ? (
                  <span className="text-destructive">
                    RPC error: {attempt.error}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {attempt.rows} row(s)
                    {attempt.topSimilarity !== null &&
                      ` · best similarity ${attempt.topSimilarity.toFixed(3)}`}
                    {attempt.accepted && " · accepted"}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-destructive">
            No lookup was attempted — the front panel produced no searchable line,
            so the name match could not run. This is a capture/OCR problem, not a
            database problem.
          </p>
        )}
      </Panel>

      <Panel variant="inset">
        <h2 className="text-overline uppercase text-muted-foreground">
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
        <h2 className="text-overline uppercase text-muted-foreground">
          EngineContext (01_TECHNICAL_SPECIFICATION §5.1)
        </h2>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-muted p-3 text-xs leading-relaxed">
          {JSON.stringify(engineContext, null, 2)}
        </pre>
        {frontOcr && backOcr && (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Front OCR confidence</dt>
              <dd>{frontOcr.meanConfidence.toFixed(3)}</dd>
              <dt className="text-muted-foreground">Front characters read</dt>
              <dd>{frontOcr.text.length}</dd>
              <dt className="text-muted-foreground">Back OCR confidence</dt>
              <dd>{backOcr.meanConfidence.toFixed(3)}</dd>
              <dt className="text-muted-foreground">Back characters read</dt>
              <dd>{backOcr.text.length}</dd>
              <dt className="text-muted-foreground">Back truncated at edge</dt>
              <dd>{backOcr.isTruncated ? "yes" : "no"}</dd>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              The catalogue name match reads the{" "}
              <strong className="font-semibold text-foreground">front</strong> panel
              only. An empty or low-confidence front reading is the usual reason a
              product that is definitely in the catalogue comes back as
              &ldquo;couldn&apos;t find&rdquo; — check the front-label text below
              against the stored product name.
            </p>
          </>
        )}
        {!frontOcr && (
          <p className="mt-3 text-sm text-muted-foreground">
            OCR has not completed.
          </p>
        )}
      </Panel>

      <div className="space-y-4">
        {front && frontOcr && <OcrText title="Front label text (product name / brand)" ocr={frontOcr} />}
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
      <h2 className="text-overline uppercase text-muted-foreground">
        {title}
      </h2>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed">
        {ocr.text || "(no text recognised)"}
      </pre>
    </Panel>
  );
}
