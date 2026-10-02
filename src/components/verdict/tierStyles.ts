import type { ResultTier, VerdictTier } from "@/engines/types"

// Compact tier styling for LIST ROWS (the dashboard feed and the lookup
// results). The full-size badges live in ResultBadge / ConfidenceBadge; these
// are the small variants for a dense row.
//
// They are shared rather than duplicated per component because the result colour
// language is a contract (06_AGENT_CONTEXT.md §2): one tier palette, one
// meaning. A feed pill painted green under a High-risk verdict is precisely the
// drift the result/confidence split exists to prevent, and two local maps in two
// components is exactly how that happens.

/** Tolerates the string tiers that arrive from stored rows. */
export function tierKey(tier: string): ResultTier {
  return tier === "low" || tier === "medium" || tier === "high" ? tier : "none"
}

/** Pill background + text for the verdict label. */
export const TIER_PILL: Record<ResultTier, string> = {
  low: "bg-gcheck-mint/60 text-gcheck-pill-ink",
  medium: "bg-warning/15 text-warning",
  high: "bg-destructive/12 text-destructive",
  none: "bg-muted text-muted-foreground",
}

/** Meter fill / dot. Follows the RESULT tier, never "always green". */
export const TIER_FILL: Record<ResultTier, string> = {
  low: "bg-success",
  medium: "bg-warning",
  high: "bg-destructive",
  none: "bg-tier-none",
}

/** Confidence keeps its own hue family, deliberately outside the result colours. */
export const CONFIDENCE_TEXT: Record<VerdictTier, string> = {
  low: "text-confidence-low",
  medium: "text-confidence-medium",
  high: "text-confidence-high",
}

export const CONFIDENCE_LABEL: Record<VerdictTier, string> = {
  low: "low confidence",
  medium: "medium confidence",
  high: "high confidence",
}

/** How the catalogue row was found — the "evidence" label on a row. */
export const EVIDENCE_LABEL: Record<"barcode" | "name" | "none", string> = {
  barcode: "Barcode match",
  name: "Name match",
  none: "Unverified",
}
