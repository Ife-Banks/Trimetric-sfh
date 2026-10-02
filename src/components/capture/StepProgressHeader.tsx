"use client"

// StepProgressHeader — the capture flow's progress chrome (Figma 58:700 /
// 58:768 "Step Progress Header" + "Progress Indicator Bar"). Step 1 = front
// label, step 2 = back/ingredients. Progress is real (1/2, 2/2), never a timer.

import { cn } from "cn"

export function StepProgressHeader({
  step,
  label,
}: {
  step: 1 | 2
  label: string
}) {
  const pct = Math.round((step / 2) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.4px] text-ink-muted">
          Step {step} of 2
        </p>
        <p className="text-[10px] font-medium text-ink-muted" aria-live="polite">
          {label}
        </p>
      </div>
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-surface-tinted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`Capture progress ${pct}%`}
      >
        <div
          className="h-full rounded-full bg-emerald-mid transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function StepDot({
  active,
  completed,
}: {
  active: boolean
  completed: boolean
}) {
  return (
    <span
      className={cn(
        "size-2 rounded-full",
        completed ? "bg-primary" : active ? "bg-primary/60" : "bg-muted"
      )}
      aria-hidden="true"
    />
  )
}
