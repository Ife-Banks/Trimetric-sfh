// ResultBadge — the verdict tier, ALWAYS rendered with its text label
// alongside the colour (03_FRONTEND_ARCHITECTURE.md §3). Pill shape; the
// ConfidenceBadge is deliberately a different shape (rounded chip + signal
// meter) so the two can never be mistaken for one merged badge. This is the
// primary verdict element, so it carries the larger type and strongest tint.
// Tier colours come from the same semantic tokens as the status badges so the
// whole app shares one status language.

import type { ResultTier } from "@/engines/types"

const tierStyles: Record<ResultTier, string> = {
  low: "border-success/30 bg-success/10 text-success dark:border-success/40 dark:bg-success/15",
  medium:
    "border-warning/35 bg-warning/10 text-warning dark:border-warning/40 dark:bg-warning/15",
  high: "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40 dark:bg-destructive/15",
  none: "border bg-muted text-muted-foreground",
}

const tierDot: Record<ResultTier, string> = {
  low: "bg-success",
  medium: "bg-warning",
  high: "bg-destructive",
  none: "bg-muted-foreground",
}

export function ResultBadge({ tier, label }: { tier: ResultTier; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-base font-bold tracking-tight shadow-xs ${tierStyles[tier]}`}
    >
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${tierDot[tier]}`} />
      {label}
    </span>
  )
}