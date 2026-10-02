// Gauge value for ResultGauge — the number inside the ring is REAL data only
// (08_DESIGN_SYSTEM.md §2 / UI_UX_Redesign_Prompt.md "Keep the circular gauge"):
//   GMO      → the count of crop-derived terms the engine matched
//   fluoride → the ppm the ENGINE classified on, read from matchedTerms
// Returns null when no honest number exists — the ring still renders, colored
// by result tier, with no invented percentage.
//
// Fluoride concentration on real labels appears as "1450 ppm", "1100 ppm F" or
// "0.24%". The % form is converted to ppm inside fluorideEngine using the
// matched compound's published multiplier (e.g. 0.243% sodium fluoride x 4500 =
// 1094 ppm) and published on that match's `detail` field — which
// 01_TECHNICAL_SPECIFICATION.md §5 defines as the place for values like this.
// This module renders that number; it never re-derives it. The ring and the
// tier beside it therefore cannot disagree, because there is only one
// calculation behind both.
//
// This is UI-layer only (not in src/engines/) because it maps an EngineResult
// to a display value; the engines themselves stay pure.

import type { EngineResult, ResultTier } from "@/engines/types"

// Severity expression, not a score: the arc/bar grows with the tier. Exported
// so the history feed card cannot drift from the result ring — both are
// "engine result → display" mappings, and a feed card that disagreed with the
// verdict screen would be the worst kind of bug to find.
export const TIER_FRACTION: Record<ResultTier, number> = {
  none: 0,
  low: 0.28,
  medium: 0.55,
  high: 0.82,
}

/** Tolerates the string tiers that arrive from stored rows (SavedScan). */
export function tierFraction(tier: string): number {
  return TIER_FRACTION[tier as ResultTier] ?? 0
}

function fluorideGaugeValue(result: EngineResult): { number: string; caption: string } | null {
  const compound = result.matchedTerms.find((t) => t.kind === "active_compound")
  if (!compound?.detail) return null
  const ppm = /^(\d+(?:\.\d+)?)\s*ppm$/.exec(compound.detail.trim())
  if (!ppm) return null
  return { number: ppm[1], caption: "ppm fluoride" }
}

export function gaugeValue(result: EngineResult): { number: string; caption: string } | null {
  if (result.category === "gmo_food") {
    const n = result.matchedTerms.filter(
      (t) => t.kind === "explicit" || t.kind === "ambiguous"
    ).length
    if (n === 0) return null
    return { number: String(n), caption: n === 1 ? "crop-derived ingredient" : "crop-derived ingredients" }
  }

  return fluorideGaugeValue(result)
}
