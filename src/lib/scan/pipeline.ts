// Scan pipeline — the deterministic part of `analyze()`, extracted so it is
// testable without a camera, a worker, or a network.
//
// This exists because "the scan returns nothing useful" was not reproducible:
// the logic lived inline in a React component, so the only way to exercise it
// was to point a phone at a real label. Everything here is a pure function of
// already-captured text, which means the failure modes are now assertable.

import { gmoEngine } from "@/engines/gmoEngine";
import { fluorideEngine } from "@/engines/fluorideEngine";
import { productToEngineResult } from "@/engines/fromProduct";
import type { EngineContext, EngineResult } from "@/engines/types";
import type {
  FluorideLookupConfig,
  GmoLookupConfig,
  LookupCategory,
  LookupConfig,
} from "@/lib/config/lookupConfig";
import type { IdentificationResult } from "@/lib/identification/productIdentification";

export interface OcrOutcome {
  text: string;
  meanConfidence: number;
  isTruncated: boolean;
}

export interface ScanPipelineInput {
  category: LookupCategory;
  frontText: string;
  backText: string;
  /** Front-label OCR confidence — carries the product name / brand. */
  front: OcrOutcome;
  /** Ingredients-panel OCR confidence — this is what the engines score. */
  back: OcrOutcome;
  identification: IdentificationResult;
  lookupConfig: LookupConfig;
  /**
   * Keyword-based oral-care subcategory detection. Injected rather than imported
   * so this module stays free of the client bundle's heavier deps, and so a test
   * can drive it deterministically.
   */
  detectOralCareSubcategory?: (frontText: string, backText: string, config: FluorideLookupConfig) => string;
}

export interface ScanPipelineResult {
  engineResult: EngineResult;
  engineContext: EngineContext;
  /** What the pipeline ran on — used by the debug panel to explain a verdict. */
  scoredText: string;
}

export function buildEngineContext(input: ScanPipelineInput): EngineContext {
  const { product } = input.identification;
  const subcategory =
    product?.subcategory ??
    (input.category === "gmo_food"
      ? "packaged_food"
      : input.detectOralCareSubcategory?.(
          input.frontText,
          input.backText,
          input.lookupConfig as FluorideLookupConfig
        ) ?? "");

  return {
    // The engines score the INGREDIENTS panel, so its confidence is the one
    // that belongs in the context. Using the front label's confidence would let
    // a crisply-photographed brand name mask a garbled ingredient list.
    ocrMeanConfidence: input.back.meanConfidence,
    isTruncated: input.back.isTruncated,
    identityMatch: input.identification.identityMatch,
    identitySimilarity: input.identification.similarity,
    category: product?.category ?? input.category,
    subcategory,
    // FR-1 puts certification marks on the FRONT panel. Without this the GMO
    // certification short-circuit only ever saw the ingredient list and missed
    // seals printed next to the brand name.
    packageFrontText: input.frontText,
  };
}

/**
 * Route to exactly one engine, or render a stored catalogue verdict.
 *
 * Throws {@link PipelineError} when the inputs cannot produce a verdict at all,
 * so the caller can show something actionable instead of a blank screen.
 */
export function runScanPipeline(input: ScanPipelineInput): ScanPipelineResult {
  const { identification, lookupConfig, category } = input;
  const engineContext = buildEngineContext(input);
  const product = identification.product;

  // A catalogue hit short-circuits the rules engine entirely — the stored row is
  // the source of truth (02_SYSTEM_ARCHITECTURE.md §4.1).
  if (product) {
    return {
      engineResult: productToEngineResult(
        product,
        identification.identityMatch,
        identification.similarity,
        engineContext.ocrMeanConfidence
      ),
      engineContext,
      scoredText: product.ingredients_text,
    };
  }

  const scoredText = input.backText;

  // No catalogue match and nothing readable to score. Running an engine over an
  // empty string silently produced a confident-looking "Low GMO Likelihood",
  // which reads as a verdict when it is really "we could not read the label".
  // Say so explicitly instead.
  if (!scoredText.trim()) {
    throw new PipelineError(
      "no_text",
      "No ingredient text could be read from the back label. Retake the photo " +
        "with the ingredients panel filling the frame, flat and well lit."
    );
  }

  if (category === "oral_care") {
    return {
      engineResult: fluorideEngine(scoredText, engineContext, lookupConfig as FluorideLookupConfig),
      engineContext,
      scoredText,
    };
  }

  return {
    engineResult: gmoEngine(scoredText, engineContext, lookupConfig as GmoLookupConfig),
    engineContext,
    scoredText,
  };
}

export type PipelineErrorCode = "no_text";

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;

  constructor(code: PipelineErrorCode, message: string) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
  }
}
