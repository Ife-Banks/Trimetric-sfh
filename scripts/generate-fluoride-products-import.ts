import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fluorideEngine } from "../src/engines/fluorideEngine"
import type { EngineContext } from "../src/engines/types"
import type { FluorideLookupConfig } from "../src/lib/config/lookupConfig"
import configJson from "../data/fluoride_lookup_config_v1.3.json"

interface SourceProduct {
  sourceId: number | null
  name: string
  brand: string | null
  sourceCategory: string
  ingredients: string
}

const inputPath = process.argv[2]
if (!inputPath) throw new Error("Pass the JSON export path from the workbook extraction step.")

const sourceProducts = JSON.parse(readFileSync(inputPath, "utf8")) as SourceProduct[]
const config = configJson as FluorideLookupConfig
if (config.version !== "1.3") throw new Error("Expected fluoride ruleset version 1.3.")

function sqlText(value: string | null): string {
  return value === null ? "null" : `'${value.replaceAll("'", "''")}'`
}

function categoryFor(product: SourceProduct): "toothpaste_gel" | "mouthwash_rinse" {
  return /mouthwash|oral rinse|mouth rinse|mondwater|collutorio/i.test(
    `${product.sourceCategory} ${product.name} ${product.ingredients}`
  ) ? "mouthwash_rinse" : "toothpaste_gel"
}

const reviewRows: string[] = []
const rows = sourceProducts.flatMap((product) => {
  if (!product.name || !product.ingredients || !product.sourceCategory) {
    throw new Error(`Source row ${product.sourceId ?? "unknown"} is missing required product data.`)
  }
  const subcategory = categoryFor(product)
  const context: EngineContext = {
    ocrMeanConfidence: 1,
    isTruncated: false,
    identityMatch: "none",
    category: "oral_care",
    subcategory,
  }
  const result = fluorideEngine(product.ingredients, context, config)
  if (result.result.label === "Unclassified") {
    reviewRows.push(`${product.name} (source row ${product.sourceId ?? "unknown"}): ${product.ingredients}`)
    return []
  }
  return [`  (${sqlText(product.name)}, ${sqlText(product.brand)}, '${subcategory}', ${sqlText(product.ingredients)}, '${result.result.tier}', ${sqlText(result.result.label)}, '${result.confidence.tier}', '${JSON.stringify(result.matchedTerms).replaceAll("'", "''")}'::jsonb, ${sqlText(result.guidance)}, '${result.configVersion}')`]
})

if (sourceProducts.length !== 55) throw new Error(`Expected 55 oral-care products; received ${sourceProducts.length}.`)
if (rows.length === 0) throw new Error("No products had a classifiable fluoride result; refusing to generate an empty import.")

const sql = `-- Curated oral-care products from the docs fluoride workbook.
-- Verdicts, confidence, matches, and guidance are recomputed with fluorideEngine/config v1.3.
-- Safe to rerun: existing oral_care rows with the same normalized product name are skipped.
-- No barcode is supplied in the source workbook; barcode remains NULL.
-- ${rows.length} classifiable products included; ${reviewRows.length} unclassified products withheld for review.

begin;

do $guard$
begin
  if not exists (
    select 1 from public.lookup_config
    where category = 'oral_care' and version = '1.3' and is_published = true
  ) then
    raise exception 'Publish oral_care lookup_config version 1.3 before importing products.';
  end if;
end;
$guard$;

with incoming (name, brand, subcategory, ingredients_text, result_tier, result_label, confidence_tier, matched_terms, guidance_text, config_version) as (
  values
${rows.join(",\n")}
), inserted as (
  insert into public.products (
    barcode, name, brand, category, subcategory, ingredients_text,
    result_tier, result_label, confidence_tier, matched_terms,
    guidance_text, config_version
  )
  select
    null, incoming.name, incoming.brand, 'oral_care', incoming.subcategory,
    incoming.ingredients_text, incoming.result_tier::verdict_tier,
    incoming.result_label, incoming.confidence_tier::verdict_tier,
    incoming.matched_terms, incoming.guidance_text, incoming.config_version
  from incoming
  where not exists (
    select 1 from public.products existing
    where existing.category = 'oral_care'
      and lower(btrim(existing.name)) = lower(btrim(incoming.name))
  )
  returning id
)
select count(*) as inserted_this_run from inserted;

select category, count(*) as oral_care_product_count
from public.products
where category = 'oral_care'
group by category;

commit;
`

const outputPath = resolve("supabase/import-fluoride-products.sql")
writeFileSync(outputPath, sql, "utf8")
const reviewPath = resolve("supabase/import-fluoride-products-review.txt")
writeFileSync(reviewPath, reviewRows.length ? `${reviewRows.join("\n")}\n` : "No products withheld for review.\n", "utf8")
process.stdout.write(`Generated ${outputPath} with ${rows.length} classifiable products; withheld ${reviewRows.length} for review.\n`)
