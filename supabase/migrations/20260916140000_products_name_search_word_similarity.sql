-- Product name search — v2: word-boundary-aware scoring (identification tier 2).
--
-- WHY v2 exists: v1 (20260916120000) scored with plain whole-string
-- pg_trgm similarity() at threshold 0.6. Live verification against the seeded
-- catalogue showed it failing on realistic OCR input:
--   'corn flakes'        → similarity 0.545 'Uncle Sam Corn Flakes' (missed at 0.6)
--   'indomie noodles'    → similarity ≈ 0.0  (words too far apart in name)
--   'groundnut butter'   → 0.630 (barely cleared)
--
-- v2 scores each candidate as the GREATEST of three metrics and lowers the
-- default threshold to 0.4:
--   similarity(a, b)                — near-exact whole-name matches
--   word_similarity(a, b)           — query appears ~contiguously inside name
--   strict_word_similarity(a, b)    — same, stricter word boundaries
--
-- Consistency: src/lib/identification/productIdentification.ts now forwards
-- NAME_MATCH_THRESHOLD (=0.4) explicitly, so this default only matters for
-- direct SQL / dashboard use.

create or replace function search_products_by_name(
  p_name      text,
  p_threshold float8 default 0.4
)
returns table (
  id             uuid,
  barcode        text,
  name           text,
  brand          text,
  category       product_category,
  subcategory    text,
  ingredients_text text,
  result_tier    verdict_tier,
  result_label   text,
  confidence_tier verdict_tier,
  matched_terms  jsonb,
  guidance_text  text,
  config_version text,
  similarity     float8
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    p.id,
    p.barcode,
    p.name,
    p.brand,
    p.category,
    p.subcategory,
    p.ingredients_text,
    p.result_tier,
    p.result_label,
    p.confidence_tier,
    p.matched_terms,
    p.guidance_text,
    p.config_version,
    greatest(
      similarity(lower(p.name), lower(p_name)),
      word_similarity(lower(p_name), lower(p.name)),
      strict_word_similarity(lower(p_name), lower(p.name))
    ) as similarity
  from products p
  where greatest(
      similarity(lower(p.name), lower(p_name)),
      word_similarity(lower(p_name), lower(p.name)),
      strict_word_similarity(lower(p_name), lower(p.name))
    ) >= p_threshold
  order by similarity desc
  limit 10;
$$;

grant execute on function search_products_by_name(text, float8) to anon;
grant execute on function search_products_by_name(text, float8) to authenticated;