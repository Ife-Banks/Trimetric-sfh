// Gauge value for ResultGauge — the number inside the ring is REAL data only
// (08_DESIGN_SYSTEM.md §2 / UI_UX_Redesign_Prompt.md "Keep the circular gauge"):
//   GMO      → the distinct crop-family count (N) that drove the result tier
//   fluoride → the ppm value read off the label (never a fallback default)
// Returns null when no honest number exists — the ring still renders, colored
// by result tier, with no invented percentage.
//
// This is UI-layer only (not in src/engines/) because it maps an EngineResult
// to a display value; the engines themselves stay pure.

import type { EngineResult } from "@/engines/types"

export function gaugeValue(
  result: EngineResult,
  ingredientsText: string | undefined
): { number: string; caption: string } | null {
  if (result.category === "gmo_food") {
    const n = result.matchedTerms.filter(
      (t) => t.kind === "explicit" || t.kind === "ambiguous"
    ).length
    if (n === 0) return null
    return { number: String(n), caption: n === 1 ? "crop-derived ingredient" : "crop-derived ingredients" }
  }

  const match = /(\d+(?:\.\d+)?)\s*ppm/i.exec(ingredientsText ?? "")
  if (match) return { number: match[1], caption: "ppm fluoride" }
  return null
}