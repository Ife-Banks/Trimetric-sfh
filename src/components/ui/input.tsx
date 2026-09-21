import * as React from "react"
import { cn } from "cn"

// Input (08 §3 "Inputs & Selects"): radius-sm, 1px --border, --surface fill,
// space-3 vertical padding. Focus: --primary border + soft ring-2 ring-primary/20.
// Error: --destructive border + ring (helper text is rendered by Field, never a
// color-only change). 44px height keeps the minimum touch target.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-sm border border-input bg-surface px-3 py-3 text-base transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-surface-muted",
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }