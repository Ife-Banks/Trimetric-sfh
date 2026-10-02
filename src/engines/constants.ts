// Shared engine constants.
//
// These live in their own leaf module rather than in either engine, because
// both engines and the product-identification layer need them. Keeping them in
// a dependency-free module is what lets `src/engines/` stay free of Supabase
// imports — see 06_AGENT_CONTEXT.md §5: "nothing in `src/engines/` may import
// React or any Supabase client."

// FR-2 (01_TECHNICAL_SPECIFICATION.md §5.1): a name match at or above this
// similarity is "strong" — the stored verdict is used and its confidence tier
// is preserved. Below it (but at or above NAME_MATCH_THRESHOLD) the stored
// verdict is used with confidence capped at Medium.
export const NAME_MATCH_STRONG = 0.8;

// FR-2: below this similarity there is no match at all and the deterministic
// category engine runs from a cold start over the OCR'd ingredients text.
export const NAME_MATCH_THRESHOLD = 0.4;

// FR-3 (01_TECHNICAL_SPECIFICATION.md §3): "If mean OCR confidence < 0.6,
// this feeds the confidence scoring as a penalty."
//
// The penalty is applied ONCE per product, not once per match, for the same
// reason the ambiguous-derivative penalty is: it describes one fact about the
// label ("this text was read unreliably"), not N facts.
// See 07_GMO_DATASET_QA_REVIEW.md §4.
export const OCR_CONFIDENCE_PENALTY_THRESHOLD = 0.6;

// Confidence band boundaries shared by both engines
// (GMO_Build_Guide.md §6: 4-5 High, 2-3 Medium, 0-1 Low).
export function tierFromPoints(points: number): "low" | "medium" | "high" {
  if (points >= 4) return "high";
  if (points >= 2) return "medium";
  return "low";
}