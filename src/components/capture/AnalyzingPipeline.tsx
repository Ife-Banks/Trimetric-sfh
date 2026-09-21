// AnalyzingPipeline — the OCR/engine progress checklist (08 §3 "Loading
// states", UI_UX_Redesign_Prompt "step-list pattern"). Each line reflects a
// REAL pipeline stage completing in sequence; the component takes the index of
// the active stage from the scan flow itself (barcode-heavy scans skip OCR
// stages), never a fake timer.

import { Check, Loader2 } from "lucide-react"
import { cn } from "cn"

const STAGES = [
  { id: "image", label: "Preparing images" },
  { id: "catalogue", label: "Checking the catalogue" },
  { id: "reading", label: "Reading product label" },
  { id: "identifying", label: "Identifying the product" },
  { id: "scoring", label: "Scoring the verdict" },
]

export function AnalyzingPipeline({
  stage,
  percent,
  note,
}: {
  /** Index of the active stage (0-based into STAGES). Earlier = done, later = pending. */
  stage: number
  /** Real progress 0–100 for the active stage, when available. */
  percent?: number
  /** Supplementary text for the active stage (e.g. the current OCR language/label). */
  note?: string
}) {
  return (
    <ol className="space-y-3" aria-label="Analysis progress">
      {STAGES.map((def, i) => {
        const done = i < stage
        const active = i === stage
        return (
          <li
            key={def.id}
            className={cn("flex items-center gap-3 text-sm", !done && !active && "opacity-60")}
            aria-current={active ? "step" : undefined}
          >
            {done ? (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="size-3.5" aria-hidden="true" />
              </span>
            ) : active ? (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              </span>
            ) : (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {i + 1}
              </span>
            )}
            <span
              className={cn(
                "min-w-0 flex-1",
                active && "font-semibold",
                done && i > 0 && "text-muted-foreground"
              )}
            >
              {def.label}
            </span>
            {active && (percent !== undefined || note) && (
              <span className="shrink-0 text-caption text-muted-foreground" aria-live="polite">
                {note || (percent !== undefined ? `${Math.round(percent)}%` : "")}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}