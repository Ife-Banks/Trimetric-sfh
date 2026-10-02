import { BadgeCheck, Leaf, ScanText } from "lucide-react"
import type { CatalogueStats } from "@/lib/api/catalogueStats"

// Trust metrics bar (Figma `bobby` 948:3058) — three counts under the hero.
//
// Every number here is read from the database at render time (see
// lib/api/catalogueStats): the catalogue size, the number of rules in the
// PUBLISHED rulesets, and the crop families the GMO ruleset tracks. The design
// shipped "85,000+ Verified Items", "Rules Engine Database" and "Zero Bias
// Independent Data"; the first was a number the app could not substantiate and
// the other two were a slogan and a claim with nothing behind it. The bar now
// makes only the claims the data supports, which is why the labels changed.
//
// Renders nothing when the counts are unavailable — an absent bar beats one
// showing invented figures.
export function TrustMetricsBar({ stats }: { stats: CatalogueStats | null }) {
  if (!stats) return null

  const metrics = [
    { icon: BadgeCheck, value: String(stats.products), label: "Verified Items" },
    { icon: ScanText, value: String(stats.rules), label: "Engine Rules" },
    { icon: Leaf, value: String(stats.crops), label: "Crops Tracked" },
  ]

  return (
    <section
      aria-label="Trust metrics"
      className="grid grid-cols-3 gap-1 rounded-md bg-gcheck-tint px-2 py-2"
    >
      {metrics.map(({ icon: Icon, value, label }) => (
        <div key={label} className="flex flex-col items-center text-center">
          <span className="flex size-7 items-center justify-center rounded-full bg-surface text-gcheck-accent">
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
          <p className="mt-2 text-[13px] font-bold leading-[18px] tabular-nums text-primary">
            {value}
          </p>
          {/* Deliberately NOT uppercased. The design's labels are mixed case —
              "Verified Items" occupies 81px at 11/700, whereas the file's truly
              uppercase strings ("TRUSTED FOOD TRANSPARENCY") run ~7.7px per
              character, about 25% wider. Forcing uppercase made the longest
              label wrap to a second line and stretched the bar. */}
          <p className="mt-0.5 text-[11px] font-bold leading-4 tracking-[0.04em] text-gcheck-body">
            {label}
          </p>
        </div>
      ))}
    </section>
  )
}
