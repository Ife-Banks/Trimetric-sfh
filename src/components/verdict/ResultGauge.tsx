// ResultGauge — the "Diagnostic Result" ring. Represents RESULT ONLY: fill
// proportion and colour come from result.tier (08 §2, UI_UX_Redesign_Prompt
// "non-negotiable structural fix"). The centre number, when present, is a real
// metric (GMO N-count / fluoride ppm) from `value`; there is never a fabricated
// match percentage. ConfidenceBadge is a separate element — shape families
// never overlap.

import { cn } from "cn"
import type { ResultTier } from "@/engines/types"
import { TIER_FRACTION } from "@/components/verdict/gaugeValue"

const TIER_COLOR: Record<ResultTier, string> = {
  low: "text-success",
  medium: "text-warning",
  high: "text-destructive",
  none: "text-tier-none",
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

  // The ring itself is decorative — ResultBadge beside it already states the
  // result tier in text (that separation is the whole point of the two-badge
  // constraint). This must NOT be role="img" with an aria-label: that replaces
  // the subtree for assistive tech, which hid the centre readout entirely — a
  // screen-reader user heard "Result: medium, image" and never heard
  // "1450 ppm fluoride", the actual metric. Instead the svg is hidden and the
  // real value is exposed as ordinary text.
  return (
    <div className={cn("relative size-40", className)}>
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
        <span className="sr-only">Result reading: </span>
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