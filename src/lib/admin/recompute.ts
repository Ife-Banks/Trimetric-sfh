// Admin live-recompute preview (02_SYSTEM_ARCHITECTURE.md §4.3, 05_SECURITY
// APPROVAL-INTEGRITY): the admin approves a COMPUTED verdict, never hand-typed
// values. This rebuilds the EngineContext from what was submitted, then runs
// the real rules engine against the (possibly corrected) ingredients text.

import { gmoEngine } from "../../engines/gmoEngine"
import type { EngineContext, EngineResult } from "../../engines/types"

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
    subcategory:
      submission.subcategory || (submission.category === "gmo_food" ? "packaged_food" : "oral_care_product"),
  }
}

// A certification the admin marks is evidence for the engine's certification
// short-circuit, so it must be part of the text the engine scans — and, because
// `products` has no certification column, it is folded into the stored
// ingredients_text on approval.
export function composeScoringText(
  ingredientsText: string,
  certificationText?: string | null
): string {
  const ingredients = ingredientsText.trim()
  const cert = (certificationText ?? "").trim()
  if (!cert || cert.toLowerCase() === "none visible") return ingredients
  return ingredients ? `${ingredients}, ${cert}` : cert
}

// Category dispatch. gmo_food is wired; oral_care lands in Phase 6. Returning
// null (rather than guessing with the wrong engine) keeps the queue honest for
// any oral-care rows that slip in.
export function recomputeVerdict(
  ingredientsText: string,
  certificationText: string | null | undefined,
  submission: SubmissionForReview
): EngineResult | null {
  if (submission.category !== "gmo_food") return null
  return gmoEngine(composeScoringText(ingredientsText, certificationText), rebuildEngineContext(submission))
}