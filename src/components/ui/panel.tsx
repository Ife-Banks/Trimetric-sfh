import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Panel — the shared surface language. One radius, three recipes:
//   elevated — card (border + card surface + shadow) for primary containers
//   inset    — muted technical/inset area (no visible border)
//   hairline — section box (border on the page background)
const panelVariants = cva("rounded-xl border", {
  variants: {
    variant: {
      elevated: "bg-card text-card-foreground shadow-sm",
      inset: "border-transparent bg-muted/50",
      hairline: "bg-background",
    },
    padding: {
      none: "",
      sm: "p-3",
      md: "p-4",
      lg: "p-6",
    },
  },
  defaultVariants: {
    variant: "hairline",
    padding: "md",
  },
})

export interface PanelProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof panelVariants> {}

function Panel({ className, variant, padding, ...props }: PanelProps) {
  return (
    <div
      data-slot="panel"
      className={cn(panelVariants({ variant, padding }), className)}
      {...props}
    />
  )
}

export { Panel, panelVariants }