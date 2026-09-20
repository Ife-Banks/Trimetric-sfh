import type { ReactNode } from "react"
import { cn } from "cn"

// PageContainer + PageHeader — the shared page shell. Enforces a consistent
// measure per page type and a consistent title/description/actions header so
// every screen opens the same way.
export type ContainerSize = "sm" | "md" | "lg" | "xl"

const WIDTHS: Record<ContainerSize, string> = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
}

function PageContainer({
  size = "sm",
  className,
  ...props
}: React.ComponentProps<"main"> & { size?: ContainerSize }) {
  return (
    <main
      data-slot="page-container"
      id="main"
      tabIndex={-1}
      className={cn("mx-auto w-full flex-1 px-4 py-8 outline-none", WIDTHS[size], className)}
      {...props}
    />
  )
}

export interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export { PageContainer, PageHeader }