drop function if exists search_products_by_name(text, float8);

create function search_products_by_name(
  p_name text,
  p_category product_category,
  p_threshold float8 default 0.4
)
returns table (
  id uuid,
  barcode text,
  name text,
  brand text,
  category product_category,
  subcategory text,
  ingredients_text text,
  result_tier verdict_tier,
  result_label text,
  confidence_tier verdict_tier,
  matched_terms jsonb,
  guidance_text text,
  config_version text,
  similarity float8
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
  where p.category = p_category
    and greatest(
      similarity(lower(p.name), lower(p_name)),
      word_similarity(lower(p_name), lower(p.name)),
      strict_word_similarity(lower(p_name), lower(p.name))
    ) >= p_threshold
  order by similarity desc
  limit 10;
$$;

grant execute on function search_products_by_name(text, product_category, float8) to anon, authenticated;
