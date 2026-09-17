"use client"

// ConfidenceBadge — deliberately NOT a pill. Hexagon + signal bars so a
// "Low result / High confidence" and a "Low result / Low confidence" are
// distinguishable at a glance by shape, not just colour (03_FRONTEND_ARCHITECTURE
// §3, 06_AGENT_CONTEXT §2.1). Tapping expands the human-readable factors.

import { useId, useState } from "react"
import type { VerdictTier } from "@/engines/types"

type Tier = VerdictTier

const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)"

const tierStyles: Record<Tier, { border: string; fill: string; bar: string; bars: number; label: string }> = {
  high: {
    border: "border-violet-300 dark:border-violet-700",
    fill: "bg-violet-50 dark:bg-violet-950/60",
    bar: "bg-violet-500",
    bars: 3,
    label: "High confidence",
  },
  medium: {
    border: "border-sky-300 dark:border-sky-700",
    fill: "bg-sky-50 dark:bg-sky-950/60",
    bar: "bg-sky-500",
    bars: 2,
    label: "Medium confidence",
  },
  low: {
    border: "border-slate-300 dark:border-slate-700",
    fill: "bg-slate-100 dark:bg-slate-900",
    bar: "bg-slate-400",
    bars: 1,
    label: "Low confidence",
  },
}

function SignalBars({ level, barClass }: { level: number; barClass: string }) {
  return (
    <span aria-hidden="true" className="flex h-4 items-end gap-0.5">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`w-1 rounded-sm ${n <= level ? barClass : "bg-current opacity-25"}`}
          style={{ height: `${n * 5}px` }}
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
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={`flex items-center gap-2.5 rounded-none border py-1 pl-3 pr-4 text-sm font-semibold transition-colors ${style.fill} ${style.border}`}
        style={{ clipPath: HEX_CLIP }}
      >
        <SignalBars level={style.bars} barClass={style.bar} />
        <span className="flex flex-col items-start leading-tight" style={{ clipPath: "none" }}>
          {style.label}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          className="ml-2 mt-1 max-w-xs rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <p className="mb-1.5 font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
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