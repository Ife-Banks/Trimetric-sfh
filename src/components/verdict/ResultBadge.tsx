// ResultBadge — the verdict tier, ALWAYS rendered with its text label
// alongside the colour (03_FRONTEND_ARCHITECTURE.md §3). Pill shape; the
// ConfidenceBadge is deliberately a different shape so the two can never be
// mistaken for one merged badge.

import type { ResultTier } from "@/engines/types"

const tierStyles: Record<ResultTier, string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-300",
  medium: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-950 dark:bg-amber-950/60 dark:text-amber-300",
  high: "border-red-200 bg-red-50 text-red-800 dark:border-red-950 dark:bg-red-950/60 dark:text-red-300",
  none: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
}

const tierDot: Record<ResultTier, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-red-500",
  none: "bg-zinc-400",
}

export function ResultBadge({ tier, label }: { tier: ResultTier; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${tierStyles[tier]}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tierDot[tier]}`} />
      {label}
    </span>
  )
}