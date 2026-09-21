import type { ReactNode } from "react"
import { cn } from "cn"

// Overline — the shared eyebrow label (08 §1.2 `overline`: 11px/14px, 600,
// uppercase, tracked +0.04em). One definition reused everywhere timestamps,
// tags, and section eyebrows appear, so an eyebrow looks identical on every
// screen. The token encodes weight + tracking; uppercase is applied here once.

export interface OverlineProps {
  children: ReactNode
  className?: string
  id?: string
}

function Overline({ children, className, id }: OverlineProps) {
  return (
    <p
      data-slot="overline"
      id={id}
      className={cn("text-overline uppercase text-muted-foreground", className)}
    >
      {children}
    </p>
  )
}

export { Overline }