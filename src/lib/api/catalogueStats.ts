import { cache } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"

// Live counts behind the dashboard's trust metrics bar.
//
// The bar used to carry three marketing claims ("85,000+ Verified Items",
// "Rules Engine Database", "Zero Bias Independent Data"). Two were numbers
// describing the dataset and one was a slogan, and none of them could be checked
// against anything — a dashboard that opens with an unverifiable statistic is
// the worst place to put one. These three are measured:
//
//   products — rows in the verified catalogue
//   rules    — rules in the PUBLISHED rulesets, summed across both categories
//   crops    — crop families the published GMO ruleset tracks
//
// `rules` counts what the engines actually match on: oral-care keyword terms and
// ppm bands, plus the GMO crop families and ambiguous derivatives. It is a
// count of table rows, not a quality score, and the label says so.
//
// Returns null when the counts cannot be read. The caller renders nothing in
// that case — better an absent bar than a bar of invented numbers.

export interface CatalogueStats {
  products: number
  rules: number
  crops: number
}

// Only the arrays we count. Each is optional so a ruleset that adds or drops a
// section degrades to "not counted" instead of throwing during a render.
interface RulesetJson {
  terms_lookup_table?: unknown[]
  category_ppm_tables?: Record<string, unknown[]>
  explicit_crop_matches?: { entries?: unknown[] }
  ambiguous_derivative_matches?: { entries?: unknown[] }
}

function countRules(config: RulesetJson): number {
  const ppmRows = Object.values(config.category_ppm_tables ?? {}).reduce(
    (total, table) => total + (Array.isArray(table) ? table.length : 0),
    0
  )
  return (
    (config.terms_lookup_table?.length ?? 0) +
    ppmRows +
    (config.explicit_crop_matches?.entries?.length ?? 0) +
    (config.ambiguous_derivative_matches?.entries?.length ?? 0)
  )
}

// Wrapped in React's cache() so the dashboard and anything else on the same
// render share one pair of round trips.
export const getCatalogueStats = cache(
  async (
    supabase: Pick<SupabaseClient, "from">
  ): Promise<CatalogueStats | null> => {
    const [productsResult, configsResult] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("lookup_config").select("category, config_json").eq("is_published", true),
    ])

    if (productsResult.error || configsResult.error) return null
    if (typeof productsResult.count !== "number") return null

    const configs = (configsResult.data ?? []) as {
      category: string
      config_json: RulesetJson | null
    }[]

    const rules = configs.reduce((total, row) => total + countRules(row.config_json ?? {}), 0)
    const gmo = configs.find((row) => row.category === "gmo_food")
    const crops = gmo?.config_json?.explicit_crop_matches?.entries?.length ?? 0

    return { products: productsResult.count, rules, crops }
  }
)
