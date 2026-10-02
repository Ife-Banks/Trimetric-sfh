// Admin live-recompute preview (02_SYSTEM_ARCHITECTURE.md §4.3, 05_SECURITY
// APPROVAL-INTEGRITY): the admin approves a COMPUTED verdict, never hand-typed
// values. This rebuilds the EngineContext from what was submitted, then runs
// the real rules engine against the (possibly corrected) ingredients text.

import { gmoEngine } from "../../engines/gmoEngine"
import { fluorideEngine } from "../../engines/fluorideEngine"
import type { EngineContext, EngineResult } from "../../engines/types"
import type {
  FluorideLookupConfig,
  GmoLookupConfig,
  LookupConfig,
} from "@/lib/config/lookupConfig"

export interface SubmissionForReview {
  id: string
  category: "gmo_food" | "oral_care"
  subcategory: string | null
  product_name: string
  brand: string | null
  barcode: string | null
  ingredients_text: string
  certification_text: string | null
  concentration_text: string | null
  photo_path: string | null
  front_photo_path?: string | null
  gmo_status?: "non_gmo_certified" | "contains_gmo" | "not_sure" | null
  ocr_confidence: number | null
  engine_preview: unknown
  created_at: string
}

// The submission only preserves ocr_confidence from the original scan;
// truncation and identity were part of the scan session. A submission by
// definition came through the low-confidence path with no catalogue match
// (identityMatch 'none'), which is the honest context to recompute under.
export function rebuildEngineContext(submission: SubmissionForReview): EngineContext {
  return {
    ocrMeanConfidence: typeof submission.ocr_confidence === "number" ? submission.ocr_confidence : 0,
    isTruncated: false,
    identityMatch: "none",
    category: submission.category,
    // GMO names its catch-all bucket; oral care leaves it "" so the fluoride
    // engine resolves the subcategory from keywords or applies its tooth/gel
    // fallback (capped at Medium — never a guessed High).
    subcategory:
      submission.subcategory || (submission.category === "gmo_food" ? "packaged_food" : ""),
  }
}

// A certification the admin marks is evidence for the engine's certification
// short-circuit, so it must be part of the text the engine scans — and, because
// `products` has no certification column, it is folded into the stored
// ingredients_text on approval. For oral care the printed concentration/PPM is
// the equivalent correction and must reach the fluoride engine's ppm parser.
export function composeScoringText(
  ingredientsText: string,
  certificationText?: string | null,
  concentrationText?: string | null
): string {
  const ingredients = ingredientsText.trim()
  const cert = (certificationText ?? "").trim()
  const concentration = (concentrationText ?? "").trim()
  let text = ingredients
  if (cert && cert.toLowerCase() !== "none visible") {
    text = text ? `${text}, ${cert}` : cert
  }
  if (concentration) {
    text = text ? `${text}, ${concentration}` : concentration
  }
  return text
}

// Category dispatch — both engines run here, chosen by the submitted category.
// Exactly one runs; the admin approves the computed verdict, never hand-typed
// values.
export function recomputeVerdict(
  ingredientsText: string,
  certificationText: string | null | undefined,
  submission: SubmissionForReview,
  lookupConfig: LookupConfig,
  concentrationText?: string | null
): EngineResult | null {
  const context = rebuildEngineContext(submission)
  // Allow an in-flight admin edit to override what was submitted — the preview
  // recomputes from THOSE corrected values, not stale ones.
  const concentration = concentrationText ?? submission.concentration_text
  if (submission.category === "oral_care") {
    return fluorideEngine(
      composeScoringText(ingredientsText, certificationText, concentration),
      context,
      lookupConfig as FluorideLookupConfig
    )
  }
  return gmoEngine(
    composeScoringText(ingredientsText, certificationText),
    context,
    lookupConfig as GmoLookupConfig
  )
}
