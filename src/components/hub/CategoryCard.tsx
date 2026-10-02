import Link from "next/link"
import { Leaf, ShieldCheck, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "cn"

// The hub's two entry cards — "GMO Check" and "Fluoride Scan" (Figma
// `Untitled`, frames 1:1266 and 1:1292). This is where the two halves of the
// app meet, and it is the screen a guest lands on.
//
// Colour carries the category, using the accent tokens that already exist for
// exactly this purpose (08 §1): green for GMO, blue for oral care. The design
// draws the fluoride card in a slightly more vivid blue (#0d52d6) than
// --accent-fluoride (#2e7bc4); the token wins, because the whole point of the
// pair is that one mapping holds everywhere and a second blue would be a third
// meaning.
//
// Typography is Inter, not the design's Manrope + Space Grotesk. The other
// design file sets every screen in Inter, and the app already ships it; two more
// families would be a real cost in a PWA for a difference that is not semantic.

export type HubCategory = "gmo" | "oral_care"

interface CategoryContent {
  href: string
  eyebrow: string
  title: string
  badge: string
  body: string
  chips: string[]
  cta: string
}

const CONTENT: Record<HubCategory, CategoryContent> = {
  gmo: {
    href: "/gmo",
    eyebrow: "Organic verification",
    title: "GMO Check",
    badge: "DNA checked",
    body: "Analyze food and ingredients for bioengineered DNA, synthetic additives, and certified Non-GMO validation.",
    chips: ["Non-GMO Project", "USDA Organic"],
    cta: "Verify Food",
  },
  oral_care: {
    href: "/scan?category=fluoride",
    eyebrow: "Clinical oral care",
    title: "Fluoride Scan",
    badge: "Safe ppm",
    body: "Check dental product safety, calibrated fluoride PPM thresholds, and enamel RDA abrasiveness index.",
    chips: ["PPM limits (1,000–1,500)", "RDA safe < 250"],
    cta: "Scan Oral Care",
  },
}

const ACCENT: Record<HubCategory, { well: string; icon: string; eyebrow: string; badge: string; chip: string; button: string }> = {
  gmo: {
    well: "bg-accent-gmo-soft",
    icon: "text-accent-gmo",
    eyebrow: "text-accent-gmo",
    badge: "bg-gcheck-mint/60 text-gcheck-pill-ink",
    chip: "bg-gcheck-tint text-gcheck-body",
    button: "bg-accent-gmo text-white",
  },
  oral_care: {
    well: "bg-accent-fluoride-soft",
    icon: "text-accent-fluoride",
    eyebrow: "text-accent-fluoride",
    badge: "bg-accent-fluoride-soft text-accent-fluoride",
    chip: "bg-gcheck-tint text-gcheck-body",
    button: "bg-accent-fluoride text-white",
  },
}

const ICON: Record<HubCategory, LucideIcon> = {
  gmo: Leaf,
  oral_care: ShieldCheck,
}

export function CategoryCard({ category }: { category: HubCategory }) {
  const content = CONTENT[category]
  const accent = ACCENT[category]
  const Icon = ICON[category]

  return (
    <section className="rounded-md bg-surface p-4" aria-label={content.title}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-sm", accent.well)}>
          <Icon className={cn("size-5", accent.icon)} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[10px] font-bold uppercase tracking-[0.06em]", accent.eyebrow)}>
            {content.eyebrow}
          </p>
          <h3 className="mt-0.5 truncate text-[20px] font-bold leading-6 tracking-[-0.3px] text-foreground">
            {content.title}
          </h3>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]",
            accent.badge
          )}
        >
          {content.badge}
        </span>
      </div>

      <p className="mt-3 text-[14px] leading-5 text-gcheck-body">{content.body}</p>

      <ul className="mt-3 flex flex-wrap gap-2">
        {content.chips.map((chip) => (
          <li
            key={chip}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.02em]",
              accent.chip
            )}
          >
            <ShieldCheck className={cn("size-3", accent.icon)} aria-hidden="true" />
            {chip}
          </li>
        ))}
      </ul>

      <Button asChild className={cn("mt-4 h-12 w-full rounded-sm text-[15px] font-semibold", accent.button)}>
        <Link href={content.href}>
          {content.cta} <span aria-hidden="true">→</span>
        </Link>
      </Button>
    </section>
  )
}
