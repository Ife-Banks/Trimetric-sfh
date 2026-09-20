import type { ReactNode } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// StatusBadge — the ONE status language for the app (history rows, review
// queue, OCR confidence chips). Tinted surface + dark text, never a solid
// white-on-500 fill (AA contrast). Differs from ResultBadge (verdict) and the
// ConfidenceBadge (meter) so a status, a result, and a confidence can never
// read as the same thing.
const statusBadgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        success:
          "border-success/30 bg-success/10 text-success dark:border-success/40 dark:bg-success/15",
        warning:
          "border-warning/35 bg-warning/10 text-warning dark:border-warning/40 dark:bg-warning/15",
        danger:
          "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40 dark:bg-destructive/15",
        info: "border-info/30 bg-info/10 text-info dark:border-info/40 dark:bg-info/15",
        neutral: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

export interface StatusBadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof statusBadgeVariants> {
  icon?: ReactNode
}

function StatusBadge({ className, variant, icon, children, ...props }: StatusBadgeProps) {
  return (
    <span data-slot="status-badge" className={cn(statusBadgeVariants({ variant }), className)} {...props}>
      {icon}
      {children}
    </span>
  )
}

export { StatusBadge, statusBadgeVariants }