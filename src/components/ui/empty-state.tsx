import type { ReactNode } from "react"
import { cn } from "cn"

// EmptyState — the ONE empty language for the app (history, review queue,
// "no terms found"). Icon in a muted tile, title, optional description and a
// single action.
export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground/70">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export { EmptyState }