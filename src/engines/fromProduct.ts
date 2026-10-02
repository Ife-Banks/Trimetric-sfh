// FR-6 — stored verdict → EngineResult. When a scan resolves via tier 1
// (barcode) or tier 2 (name match), the verified `products` row is the source
// of truth: the rules engine never runs again for it. This mapper renders that
// stored row into the exact EngineResult shape so VerdictScreen can't tell the
// difference between a stored verdict and a freshly computed one.

import type { IdentityMatch, ProductRow } from "@/lib/identification/productIdentification"
import { NAME_MATCH_STRONG, OCR_CONFIDENCE_PENALTY_THRESHOLD } from "./constants"
import { GMO_CONSTRAINT_NOTICE } from "./gmoEngine"
import { FLUORIDE_CONSTRAINT_NOTICE } from "./fluorideEngine"
import type { EngineResult, EngineTerm, VerdictTier } from "./types"

const CONSTRAINT_NOTICE_BY_CATEGORY: Record<ProductRow["category"], string> = {
  gmo_food: GMO_CONSTRAINT_NOTICE,
  oral_care: FLUORIDE_CONSTRAINT_NOTICE,
}

// `products.confidence_tier` is a verdict_tier (includes 'none'); the engine
// surface only has low/medium/high. Stored rows with no confidence degrade to
// low — a stored verdict always has at least one source of confidence.
function normalizeConfidenceTier(tier: ProductRow["confidence_tier"]): VerdictTier {
  return tier === "high" ? "high" : tier === "medium" ? "medium" : "low"
}

// products.confidence_tier is a tier, not the engine's point score. Map the
// tier to the point bands gmoEngine would have produced so any consumer that
// reads `score` still sees a coherent value.
function tierScore(tier: VerdictTier): number {
  return tier === "high" ? 4 : tier === "medium" ? 2 : 1
}

// One step down the confidence bands, matching the engines' −1 OCR point
// (4→3 = high→medium, 2→1 = medium→low, 1→0 = low). A stored row keeps the
// tier's floor, so it can never be pushed below "low".
function downgradeTier(tier: VerdictTier): VerdictTier {
  return tier === "high" ? "medium" : tier === "medium" ? "low" : "low"
}

function ocrPenaltyFactor(ocrMeanConfidence: number): string {
  return `OCR quality — label text read at ${(ocrMeanConfidence * 100).toFixed(0)}% confidence, below the ${(OCR_CONFIDENCE_PENALTY_THRESHOLD * 100).toFixed(0)}% threshold`
}

function parseMatchedTerms(value: unknown): EngineTerm[] {
  if (!Array.isArray(value)) return []
  const terms: EngineTerm[] = []
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue
    const item = raw as Record<string, unknown>
    if (typeof item.term !== "string" || typeof item.normalized !== "string") continue
    const kind = item.kind
    if (kind !== "explicit" && kind !== "ambiguous" && kind !== "certification" && kind !== "active_compound")
      continue
    terms.push({
      term: item.term,
      normalized: item.normalized,
      kind,
      ...(typeof item.detail === "string" ? { detail: item.detail } : {}),
    })
  }
  return terms
}

export function productToEngineResult(
  product: ProductRow,
  matchedBy: IdentityMatch,
  identitySimilarity?: number,
  /**
   * This scan's mean OCR confidence. Optional so existing callers/tests that
   * only exercise the mapping stay valid, but the scan pipeline always passes
   * it: the stored row describes the PRODUCT, while this number describes how
   * reliably THIS label was read — and FR-3 says a sub-0.6 read is a penalty.
   */
  ocrMeanConfidence?: number
): EngineResult {
  const storedConfidence = normalizeConfidenceTier(product.confidence_tier)
  let confidenceTier: VerdictTier = matchedBy === "name" &&
    (identitySimilarity ?? 0) < NAME_MATCH_STRONG && storedConfidence === "high"
    ? "medium"
    : storedConfidence
  const constraintNotice = CONSTRAINT_NOTICE_BY_CATEGORY[product.category]
  const confidenceFactor = matchedBy === "barcode"
    ? "Stored catalogue verdict — barcode matched the verified product dataset"
    : matchedBy === "name"
      ? identitySimilarity != null && identitySimilarity >= NAME_MATCH_STRONG
        ? `Stored catalogue verdict — strong product-name match (${identitySimilarity.toFixed(2)})`
        : `Stored catalogue verdict — tentative product-name match (${(identitySimilarity ?? 0).toFixed(2)}); confidence capped at Medium`
      : "Stored verdict from the product dataset"

  // FR-3 OCR penalty, applied to the stored-verdict path too. Without it a
  // catalogue hit scanned from an unreadable photo reported the row's curated
  // confidence with no acknowledgement that the label itself was barely read.
  const factors = [confidenceFactor]
  if (typeof ocrMeanConfidence === "number" && ocrMeanConfidence < OCR_CONFIDENCE_PENALTY_THRESHOLD) {
    confidenceTier = downgradeTier(confidenceTier)
    factors.push(ocrPenaltyFactor(ocrMeanConfidence))
  }

  return {
    category: product.category,
    subcategory: product.subcategory,
    result: {
      // `none` is a first-class result tier (EngineResult.result.tier), NOT a
      // synonym for "low". For oral care it means Fluoride-Free / No Data; for
      // food it means no GMO crops found. Collapsing it to "low" made the same
      // product report a different tier depending on whether it happened to be
      // in the catalogue, and rendered a filled gauge beside a "Fluoride-Free"
      // label. Pass it through unchanged.
      tier: product.result_tier,
      label: product.result_label,
    },
    confidence: {
      tier: confidenceTier,
      score: tierScore(confidenceTier),
      factors,
    },
    matchedTerms: parseMatchedTerms(product.matched_terms),
    guidance: product.guidance_text || constraintNotice,
    constraintNotice,
    computedAt: new Date().toISOString(),
    configVersion: product.config_version,
  }
}
