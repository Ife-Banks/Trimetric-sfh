// CategoryBadge — the single wayfinding language for categories (08 §1.1):
// green is always GMO/food, blue is always oral-care/fluoride. Used on history
// rows, the review queue, and the home hub — the mapping is never swapped
// per screen.

import { Droplets, Leaf } from "lucide-react"
import { cn } from "cn"

export type Category = "gmo_food" | "oral_care"

export function CategoryBadge({
  category,
  className,
}: {
  category: Category
  className?: string
}) {
  const isGmo = category === "gmo_food"
  const Icon = isGmo ? Leaf : Droplets
  return (
    <span
      data-slot="category-badge"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-2 rounded-full border px-2 py-1 text-xs font-medium whitespace-nowrap [&>svg]:size-3 [&>svg]:shrink-0",
        isGmo
          ? "border-accent-gmo/25 bg-accent-gmo-soft text-accent-gmo"
          : "border-accent-fluoride/25 bg-accent-fluoride-soft text-accent-fluoride",
        className
      )}
    >
      <Icon aria-hidden="true" />
      {isGmo ? "Food (GMO)" : "Oral care"}
    </span>
  )
}