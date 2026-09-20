import type { ReactNode } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
} from "lucide-react"

// InlineAlert — the ONE non-blocking message language (form errors, camera
// errors, scan failures). Page-level failures keep using the Alert component.
const inlineAlertVariants = cva(
  "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm",
  {
    variants: {
      variant: {
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
        warning: "border-warning/35 bg-warning/10 text-warning",
        success: "border-success/30 bg-success/10 text-success",
        info: "border-info/30 bg-info/10 text-info",
        neutral: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

const ICON: Record<NonNullable<VariantProps<typeof inlineAlertVariants>["variant"]>, ReactNode> = {
  destructive: <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />,
  warning: <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />,
  success: <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />,
  info: <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />,
  neutral: <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />,
}

export interface InlineAlertProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof inlineAlertVariants> {
  icon?: ReactNode
}

function InlineAlert({ className, variant = "neutral", icon, children, ...props }: InlineAlertProps) {
  return (
    <div role="alert" data-slot="inline-alert" className={cn(inlineAlertVariants({ variant }), className)} {...props}>
      {icon ?? ICON[variant!]}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export { InlineAlert, inlineAlertVariants }