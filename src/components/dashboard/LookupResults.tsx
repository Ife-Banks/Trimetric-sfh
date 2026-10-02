import { SearchX } from "lucide-react"
import { productToEngineResult } from "@/engines/fromProduct"
import { gaugeValue } from "@/components/verdict/gaugeValue"
import {
  CONFIDENCE_LABEL,
  CONFIDENCE_TEXT,
  EVIDENCE_LABEL,
  TIER_PILL,
  tierKey,
} from "@/components/verdict/tierStyles"
import type { IdentityMatch, ProductRow } from "@/lib/identification/productIdentification"
import { cn } from "cn"

// Catalogue lookup results for the dashboard.
//
// Server-rendered from the same rows the scan flow matches against, and the
// verdict shown is the STORED one — mapped through productToEngineResult, the
// exact function the scan pipeline uses on a catalogue hit, so this list and a
// scan of the same product cannot disagree.
//
// No `ocrMeanConfidence` is passed: nothing here was read by OCR, and feeding a
// number in would apply a legibility penalty to a lookup that had no legibility
// problem.

function brandLine(product: ProductRow): string {
  return product.brand?.trim() || (product.category === "oral_care" ? "Oral care" : "GMO food")
}

export function LookupResults({ query, matches }: { query: string; matches: ProductRow[] }) {
  if (matches.length === 0) {
    return (
      <section aria-label="Lookup results" className="rounded-md bg-surface p-4">
        <div className="flex items-center gap-2">
          <SearchX className="size-4 shrink-0 text-gcheck-body" aria-hidden="true" />
          <p className="text-[14px] font-semibold text-primary">
            No catalogue match for &ldquo;{query}&rdquo;
          </p>
        </div>
        <p className="mt-2 text-[13px] leading-[18px] text-gcheck-body">
          Check the spelling, try the brand name alone, or scan the label — a scan still runs the
          rules engine when a product is not in the catalogue.
        </p>
      </section>
    )
  }

  return (
    <section aria-label="Lookup results">
      <div className="flex h-6 items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-primary">
          {matches.length === 1 ? "1 match" : `${matches.length} matches`} for &ldquo;{query}&rdquo;
        </h2>
      </div>

      <ul className="mt-2 space-y-3">
        {matches.map((product) => {
          const matchedBy: IdentityMatch =
            product.barcode && product.barcode === query.trim() ? "barcode" : "name"
          const result = productToEngineResult(product, matchedBy)
          const metric = gaugeValue(result)?.number ?? null
          const tier = tierKey(result.result.tier)

          return (
            <li key={product.id} className="rounded-md bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold uppercase tracking-[0.04em] text-gcheck-body">
                    {brandLine(product)}
                  </p>
                  <p className="mt-0.5 truncate text-[16px] font-semibold text-foreground">
                    {product.name}
                  </p>
                </div>
                {metric && (
                  <span className="shrink-0 text-[13px] font-bold tabular-nums text-foreground">
                    {metric}
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[11px] font-bold tracking-[0.04em]",
                    TIER_PILL[tier]
                  )}
                >
                  {result.result.label}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-semibold tracking-[0.04em]",
                    CONFIDENCE_TEXT[result.confidence.tier]
                  )}
                >
                  {CONFIDENCE_LABEL[result.confidence.tier]}
                </span>
              </div>

              {result.guidance && (
                <p className="mt-2 text-[13px] leading-[18px] text-gcheck-body">{result.guidance}</p>
              )}

              <p className="mt-2 text-[11px] font-bold tracking-[0.04em] text-gcheck-body">
                {EVIDENCE_LABEL[matchedBy]}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
