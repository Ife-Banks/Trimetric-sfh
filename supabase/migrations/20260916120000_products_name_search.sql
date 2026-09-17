-- Product name search via pg_trgm similarity (identification tier 2).
-- Applied alongside Phase 3 (capture + OCR + product identification).

create or replace function search_products_by_name(
  p_name      text,
  p_threshold float8 default 0.6
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
set search_path = public
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
    similarity(p.name, p_name) as similarity
  from products p
  where similarity(p.name, p_name) >= p_threshold
  order by similarity desc
  limit 10;
$$;

grant execute on function search_products_by_name(text, float8) to anon;
grant execute on function search_products_by_name(text, float8) to authenticated;

-- Backing index already exists from the initial migration:
--   create index products_name_trgm on products using gin (name gin_trgm_ops);