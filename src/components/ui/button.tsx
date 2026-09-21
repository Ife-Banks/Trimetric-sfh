import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Button hierarchy (08 §3 "Buttons" — never more than one primary CTA per screen):
//   primary     — solid --primary fill, --primary-foreground text, radius-full, shadow-xs
//   secondary   — outline, 1px --border, --foreground text (never a tinted primary)
//   ghost       — no border/fill, --foreground text
//   destructive — solid --destructive fill, white text; admin reject/delete only
// `outline` is kept as an alias of `secondary` for existing call sites.
// States: hover brightness-95 (solid) / bg-surface-muted (outline/ghost); active
// brightness-90, focus-visible ring-2 ring-primary/50 with 2px offset; disabled is
// opacity-50 with cursor-not-allowed (no transform).
// Sizes guarantee a >=44px touch target per 08 §5.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-100 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:brightness-95 active:brightness-90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:brightness-95 active:brightness-90 focus-visible:ring-destructive/20 dark:ring-destructive/40",
        secondary:
          "border border-border bg-background text-foreground shadow-xs hover:bg-surface-muted hover:text-foreground active:bg-surface-muted",
        outline:
          "border border-border bg-background text-foreground shadow-xs hover:bg-surface-muted hover:text-foreground active:bg-surface-muted",
        ghost: "text-foreground hover:bg-surface-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-3 has-[>svg]:px-4",
        sm: "h-11 gap-2 px-4 py-3 has-[>svg]:px-3",
        lg: "h-12 gap-2 px-6 py-3 has-[>svg]:px-5",
        icon: "size-11",
        "icon-sm": "size-11",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }