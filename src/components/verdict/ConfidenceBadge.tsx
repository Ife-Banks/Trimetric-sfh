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
import type { VerdictTier } from "@/engines/types"

type Tier = VerdictTier

const tierStyles: Record<Tier, { chip: string; bar: string; bars: number; label: string }> = {
  high: {
    chip:
      "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    bar: "bg-violet-500",
    bars: 3,
    label: "High confidence",
  },
  medium: {
    chip:
      "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
    bar: "bg-sky-500",
    bars: 2,
    label: "Medium confidence",
  },
  low: {
    chip:
      "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
    bar: "bg-slate-400",
    bars: 1,
    label: "Low confidence",
  },
}

function SignalMeter({ level, barClass }: { level: number; barClass: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-6 shrink-0 items-end justify-end gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/10"
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
          "flex items-center gap-2 rounded-lg border py-1.5 pl-2.5 pr-2 text-sm font-semibold transition-colors",
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

      {open && (
        <div
          id={panelId}
          className="ml-1 max-w-xs rounded-xl border bg-muted p-3 text-xs text-muted-foreground"
        >
          <p className="mb-1.5 font-semibold uppercase tracking-wide text-muted-foreground">
            Why this confidence
          </p>
          <ul className="list-disc space-y-1 pl-4">
            {factors.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}