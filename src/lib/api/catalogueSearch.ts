import type { SupabaseClient } from "@supabase/supabase-js"
import { NAME_MATCH_THRESHOLD } from "@/engines/constants"
import type { ProductRow } from "@/lib/identification/productIdentification"

// Catalogue lookup for the dashboard's "Lookup by Code or Name" bar.
//
// This is the same catalogue the scan flow matches against, reached by the same
// RPC (search_products_by_name) at the same threshold, so a product you find by
// typing its name here is the product a scan would have matched — not a second,
// differently-behaved search.

/** Below this, a query is too short to match anything useful. */
export const MIN_LOOKUP_LENGTH = 3

// Exactly the columns ProductRow declares, so what comes back can be handed
// straight to productToEngineResult and the stored verdict rendered from it.
const PRODUCT_COLUMNS =
  "id, barcode, name, brand, category, subcategory, ingredients_text, result_tier, result_label, confidence_tier, matched_terms, guidance_text, config_version"

/**
 * Find catalogue products by name, or by barcode when the query looks like one.
 *
 * The design's bar says "UPC / EAN", so a numeric code has to actually resolve:
 * an exact barcode hit is tried first, and only if it misses does the query fall
 * through to the fuzzy name search. Both categories are searched — the dashboard
 * has no category context to inherit.
 *
 * Returns [] for a query that is too short, and also for one that matches
 * nothing; the two are distinguished for the user by the caller, not here.
 */
export async function searchCatalogue(
  supabase: Pick<SupabaseClient, "from" | "rpc">,
  query: string,
  limit = 4
): Promise<ProductRow[]> {
  const trimmed = query.trim()
  if (trimmed.length < MIN_LOOKUP_LENGTH) return []

  if (/^\d{8,14}$/.test(trimmed)) {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("barcode", trimmed)
      .limit(1)
    if (!error) {
      const rows = (data ?? []) as ProductRow[]
      if (rows.length > 0) return rows
    }
  }

  const [gmo, oralCare] = await Promise.all([
    supabase.rpc("search_products_by_name", {
      p_name: trimmed,
      p_category: "gmo_food",
      p_threshold: NAME_MATCH_THRESHOLD,
    }),
    supabase.rpc("search_products_by_name", {
      p_name: trimmed,
      p_category: "oral_care",
      p_threshold: NAME_MATCH_THRESHOLD,
    }),
  ])

  const combined = [
    ...((gmo.data ?? []) as ProductRow[]),
    ...((oralCare.data ?? []) as ProductRow[]),
  ]

  // The RPC is called once per category, so a row cannot come back twice — but
  // dedupe anyway rather than trusting that, because a duplicate key would make
  // React drop a card silently.
  const seen = new Set<string>()
  const unique: ProductRow[] = []
  for (const row of combined) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    unique.push(row)
  }

  return unique.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)).slice(0, limit)
}
