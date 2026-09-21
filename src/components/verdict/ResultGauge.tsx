// ResultGauge — the "Diagnostic Result" ring. Represents RESULT ONLY: fill
// proportion and colour come from result.tier (08 §2, UI_UX_Redesign_Prompt
// "non-negotiable structural fix"). The centre number, when present, is a real
// metric (GMO N-count / fluoride ppm) from `value`; there is never a fabricated
// match percentage. ConfidenceBadge is a separate element — shape families
// never overlap.

import { cn } from "cn"
import type { ResultTier } from "@/engines/types"

const TIER_COLOR: Record<ResultTier, string> = {
  low: "text-success",
  medium: "text-warning",
  high: "text-destructive",
  none: "text-tier-none",
}

// Severity expression, not a score: the arc grows with the tier.
const TIER_FRACTION: Record<ResultTier, number> = {
  none: 0,
  low: 0.28,
  medium: 0.55,
  high: 0.82,
}

export function ResultGauge({
  tier,
  value,
  className,
}: {
  tier: ResultTier
  value?: { number: string; caption: string } | null
  className?: string
}) {
  const r = 52
  const circumference = 2 * Math.PI * r
  const fraction = TIER_FRACTION[tier]
  const offset = circumference * (1 - fraction)

  return (
    <div className={cn("relative size-40", className)} role="img" aria-label={`Result: ${tier}`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          className="stroke-surface-muted"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          stroke="currentColor"
          className={cn("transition-[stroke] duration-200", TIER_COLOR[tier])}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {value ? (
          <>
            <span className="text-h1 font-bold tracking-tight tabular-nums">{value.number}</span>
            <span className="text-caption text-muted-foreground">{value.caption}</span>
          </>
        ) : (
          <span className="text-caption text-muted-foreground">No data</span>
        )}
      </div>
    </div>
  )
}