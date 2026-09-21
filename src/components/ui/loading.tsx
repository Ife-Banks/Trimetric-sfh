import type { ReactNode } from "react"
import { cn } from "cn"
import { Spinner } from "@/components/ui/spinner"

// LoadingState — the minimum loading language (08 §3 "Loading states"): never a
// bare spinner with no context. A label states what is happening; an optional
// caption adds a second line. The multi-step scan pipeline keeps its own
// AnalyzingPipeline checklist — this is the single-element quiet variant.
// `role="status"` + aria-live announces the state to screen readers.
export interface LoadingStateProps {
  label: string
  description?: ReactNode
  className?: string
}

function LoadingState({ label, description, className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-slot="loading-state"
      className={cn("flex items-start gap-3 text-body", className)}
    >
      <Spinner className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        {description && <p className="text-caption text-muted-foreground">{description}</p>}
      </div>
    </div>
  )
}

export { LoadingState }