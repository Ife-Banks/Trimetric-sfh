"use client"

// ConfidenceBadge — deliberately NOT the same shape as ResultBadge. The result
// is a pill; this is a rounded "signal chip" with a 3-bar meter, so a "Low
// result / High confidence" and a "Low result / Low confidence" are
// distinguishable at a glance by shape, not just colour (03 §3, 06 §2.1).
// Rectangular + focus-visible ring so keyboard focus is never clipped (unlike
// the old hexagon). Tapping expands the human-readable factors.

import { useId, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"
import { Overline } from "@/components/ui/overline"
import type { VerdictTier } from "@/engines/types"

type Tier = VerdictTier

const tierStyles: Record<Tier, { chip: string; bar: string; bars: number; label: string }> = {
  high: {
    chip:
      "border-confidence-high/40 bg-confidence-high/10 text-confidence-high dark:border-confidence-high/50 dark:bg-confidence-high/15 dark:text-confidence-high",
    bar: "bg-confidence-high",
    bars: 3,
    label: "High confidence",
  },
  medium: {
    chip:
      "border-confidence-medium/40 bg-confidence-medium/10 text-confidence-medium dark:border-confidence-medium/50 dark:bg-confidence-medium/15 dark:text-confidence-medium",
    bar: "bg-confidence-medium",
    bars: 2,
    label: "Medium confidence",
  },
  low: {
    chip:
      "border-confidence-low/40 bg-confidence-low/15 text-confidence-low dark:border-confidence-low/50 dark:bg-confidence-low/15 dark:text-confidence-low",
    bar: "bg-confidence-low",
    bars: 1,
    label: "Low confidence",
  },
}

function SignalMeter({ level, barClass }: { level: number; barClass: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-6 shrink-0 items-end justify-end gap-0.5 rounded bg-black/5 p-0.5 dark:bg-surface/10"
    >
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={cn("w-1 rounded-sm", n <= level ? barClass : "bg-current opacity-20")}
          style={{ height: `${Math.max(4, n * 4)}px` }}
        />
      ))}
    </span>
  )
}

export function ConfidenceBadge({
  tier,
  factors,
}: {
  tier: Tier
  factors: string[]
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const style = tierStyles[tier]

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={cn(
          "flex min-h-12 items-center gap-2 rounded-md border py-2 pl-3 pr-2 text-sm font-semibold transition-colors",
          "hover:brightness-[0.98] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          style.chip
        )}
      >
        <SignalMeter level={style.bars} barClass={style.bar} />
        <span className="leading-tight">{style.label}</span>
        <ChevronDown
          className={cn("size-4 text-current opacity-60 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {/* 08 §4: expand/collapse 200ms ease-in-out via the grid-template-rows
          trick (0fr → 1fr), never a fixed max-height guess. Kept mounted so
          the collapse animates; hidden from AT when closed. */}
      <div
        id={panelId}
        aria-hidden={!open}
        className={cn(
          "ml-1 grid max-w-xs overflow-hidden rounded-xl transition-[grid-template-rows,opacity] duration-200 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="min-h-0">
          <div className="rounded-xl border bg-muted p-3 text-xs text-muted-foreground">
            <Overline>Why this confidence</Overline>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              {factors.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}