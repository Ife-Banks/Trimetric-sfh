// FR-6 — stored verdict → EngineResult. When a scan resolves via tier 1
// (barcode) or tier 2 (name match), the verified `products` row is the source
// of truth: the rules engine never runs again for it. This mapper renders that
// stored row into the exact EngineResult shape so VerdictScreen can't tell the
// difference between a stored verdict and a freshly computed one.

import type { IdentityMatch, ProductRow } from "@/lib/identification/productIdentification"
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
  matchedBy: IdentityMatch
): EngineResult {
  const confidenceTier = normalizeConfidenceTier(product.confidence_tier)
  const constraintNotice = CONSTRAINT_NOTICE_BY_CATEGORY[product.category]
  const confidenceFactor =
    matchedBy === "barcode"
      ? "Stored verified verdict — barcode matched the verified product dataset"
      : matchedBy === "name"
        ? "Stored verified verdict — name matched the verified product dataset"
        : "Stored verified verdict from the product dataset"

  return {
    category: product.category,
    subcategory: product.subcategory,
    result: {
      tier: product.result_tier === "none" ? "low" : product.result_tier,
      label: product.result_label,
    },
    confidence: {
      tier: confidenceTier,
      score: tierScore(confidenceTier),
      factors: [confidenceFactor],
    },
    matchedTerms: parseMatchedTerms(product.matched_terms),
    guidance: product.guidance_text || constraintNotice,
    constraintNotice,
    computedAt: new Date().toISOString(),
    configVersion: product.config_version,
  }
}