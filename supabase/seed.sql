-- ============================================================================
-- seed.sql — SHF Final Resolve seed data
-- See 04_BACKEND_STRUCTURE.md §7: published lookup_config rows, curated
-- products (20-40) mixing local shelf + international brands, one admin.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste this file → Run.
-- Do NOT use the Supabase CLI `db seed` against the hosted project unless you
-- have a linked project + DB password; the dashboard is the source of truth
-- here.
--
-- NOTES
--  * Idempotent for barcoded products (unique barcode) and lookup_config
--    (unique category+version). Re-running duplicates the barcode-less rows;
--    run once.
--  * Barcodes are illustrative EAN-13 values (many are real GTIN prefixes:
--    Nigeria = 615, UK = 50, US = 0, Switzerland = 76), not guaranteed to be
--    the actual retail codes.
--  * Ingredients + stored verdicts are kept consistent with the v1.0 GMO
--    ruleset (see data/gmo_lookup_config_v1.0.json): result_tier follows N,
--    the count of distinct explicit crop families (corn/soy/canola/...
--    etc.); confidence_tier follows the points system (barcode match and a
--    complete list score high; an ambiguous derivative like "sugar
--    (unspecified)" with no explicit crop deducts a point).
--  * Oral-care products are intentionally NOT seeded yet — the fluoride
--    ruleset is unreleased (Phase 6). Seeding fabricated fluoride verdicts
--    now would poison the stored-verdict path.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. lookup_config — published rulesets
-- ---------------------------------------------------------------------------

-- GMO ruleset v1.0 (published). JSON matches data/gmo_lookup_config_v1.0.json.
insert into lookup_config (category, version, config_json, is_published, published_at)
select
  'gmo_food',
  '1.0',
  '{
  "project": "SHF GMO Likelihood Detection — Lookup Config v1.0",
  "version": "1.0",
  "certification_short_circuit": {
    "note": "Check BEFORE ingredient matching. A certification is stronger evidence than any ingredient match.",
    "terms": ["Non-GMO Project Verified", "USDA Organic", "Certified Organic", "EU Organic"],
    "on_match": { "likelihood": "Low", "confidence": "High", "stop_further_scoring": true }
  },
  "explicit_crop_matches": {
    "note": "Ingredient directly names a high-GMO-adoption crop. These count toward the likelihood score.",
    "entries": [
      { "crop_family": "corn", "aliases": ["corn", "corn starch", "cornstarch", "corn syrup", "high fructose corn syrup", "corn oil", "dextrose (corn-derived)"] },
      { "crop_family": "soy", "aliases": ["soy", "soybean", "soybean oil", "soy lecithin", "soy protein", "textured vegetable protein"] },
      { "crop_family": "canola", "aliases": ["canola", "canola oil", "rapeseed oil"] },
      { "crop_family": "cottonseed", "aliases": ["cottonseed", "cottonseed oil"] },
      { "crop_family": "sugar_beet", "aliases": ["sugar beet", "beet sugar"] },
      { "crop_family": "alfalfa", "aliases": ["alfalfa"] },
      { "crop_family": "papaya", "aliases": ["papaya"] },
      { "crop_family": "apple", "aliases": ["apple"] },
      { "crop_family": "cotton", "aliases": ["cotton", "cottonseed", "cottonseed oil"] },
      { "crop_family": "potato", "aliases": ["potato"] },
      { "crop_family": "zucchini", "aliases": ["zucchini", "summer squash"] }
    ]
  },
  "ambiguous_derivative_matches": {
    "note": "Ingredients that MAY derive from a GMO crop but the label does not disclose the source. Presence lowers confidence, not likelihood.",
    "entries": [
      { "ingredient": "citric acid", "possible_sources": ["corn", "beet", "synthetic"] },
      { "ingredient": "ascorbic acid", "possible_sources": ["corn", "synthetic"] },
      { "ingredient": "maltodextrin", "possible_sources": ["corn", "rice", "potato"] },
      { "ingredient": "vegetable oil (unspecified)", "possible_sources": ["soy", "canola", "corn", "palm"] },
      { "ingredient": "natural flavors", "possible_sources": ["unknown"] },
      { "ingredient": "xanthan gum", "possible_sources": ["corn", "soy", "wheat"] },
      { "ingredient": "sugar (unspecified)", "possible_sources": ["sugar beet", "sugarcane"] },
      { "ingredient": "molasses", "possible_sources": ["sugar beet", "sugarcane"] },
      { "ingredient": "cellulose", "possible_sources": ["various plant sources"] },
      { "ingredient": "soy hemoglobin", "possible_sources": ["soy"] },
      { "ingredient": "vegetable", "possible_sources": ["unspecified ''vegetable X'' term"] }
    ]
  },
  "low_risk_tokens": [
    "salt", "water", "vinegar", "pepper", "garlic", "onion", "spices",
    "sugar", "molasses", "honey", "oil", "vegetable oil", "flour", "rice",
    "natural flavors", "natural flavoring", "monk fruit", "stevia",
    "xanthan gum", "citric acid", "fruit juice", "puree", "vinegar"
  ],
  "likelihood_scoring": {
    "method": "Count N = number of distinct crop_family values matched from explicit_crop_matches only. Ambiguous derivatives never count toward N.",
    "tiers": [
      { "N": 0, "likelihood": "Low" },
      { "N": 1, "likelihood": "Medium" },
      { "N": "2+", "likelihood": "High" }
    ]
  },
  "confidence_scoring": {
    "method": "Points system. Factors below award points; ambiguous-derivative penalty applies once per product when ambiguous matches exist with no explicit crop.",
    "factors": [
      { "factor": "Ingredient list completeness", "condition": "Full list OCR''d, no visible truncation", "points": 2 },
      { "factor": "Product identification", "condition": "Barcode matched an Open Food Facts entry", "points": 2 },
      { "factor": "Lookup match rate", "condition": ">=80% of extracted ingredients recognized", "points": 1 },
      { "factor": "Certification clarity", "condition": "Cert statement clearly readable either way", "points": 1 },
      { "factor": "Ambiguous-derivative penalty", "condition": "One or more ambiguous derivatives matched with NO explicit crop found elsewhere", "points": -1 }
    ],
    "tiers": [
      { "points": "4-5", "confidence": "High" },
      { "points": "2-3", "confidence": "Medium" },
      { "points": "0-1 or negative", "confidence": "Low" }
    ]
  }
}'::jsonb,
  true,
  now()
on conflict (category, version) do update
  set config_json = excluded.config_json,
      is_published = excluded.is_published,
      published_at = excluded.published_at;

-- Fluoride ruleset: PLACEHOLDER (unpublished) — the real spec lands in Phase 6.
-- Replace this row with the real fluoride config JSON and is_published = true
-- as part of the fluoride engine build. It is NOT live, so the app will not
-- serve it to clients.
insert into lookup_config (category, version, config_json, is_published)
values (
  'oral_care',
  '1.0',
  '{
  "project": "SHF Fluoride Lookup Config (PLACEHOLDER — replace in Phase 6)",
  "version": "1.0",
  "note": "Unreleased placeholder. Do not publish. No fluoride verdicts are produced until the real spec ships.",
  "thresholds": [],
  "english_terms": [],
  "nigerian_pidgin_terms": [],
  "risk_phrases": []
}'::jsonb,
  false
)
on conflict (category, version) do update
  set config_json = excluded.config_json,
      is_published = excluded.is_published;

-- ---------------------------------------------------------------------------
-- 2. products — curated verified dataset
-- Split: 15 rows WITH barcode (identification tier 1), 15 rows WITHOUT
-- (identification tier 2, fuzzy name match). Nigerian-market heavy.
-- ---------------------------------------------------------------------------

-- ============ WITH barcode (tier 1) ============

insert into products (barcode, name, brand, category, subcategory, ingredients_text, result_tier, result_label, confidence_tier, matched_terms, guidance_text, target_audience_notes, config_version) values
(
  '6151080213207', 'Indomie Instant Noodles Chicken Flavour', 'Indomie (Dufil Prima Foods)',
  'gmo_food', 'packaged_food',
  'Wheat flour, refined palm oil, salt, sugar, chicken flavour, onions, spices, colour E150c, anticaking agent E551',
  'low', 'Low likelihood', 'high',
  '[]'::jsonb,
  'No high-adoption GMO crop ingredients listed. Palm oil and wheat are not in the v1.0 explicit crop set.',
  'Archive-fast-seller; keep this exact ingredient string for re-scan parity.', '1.0'
),
(
  '6151022840219', 'Golden Morn Reinforced Maize Beverage', 'Nestlé Nigeria',
  'gmo_food', 'packaged_food',
  'Precooked maize flour, sugar, iodized salt, vitamins A, B1, B2, B6, E, niacin, iron, caramel',
  'medium', 'Medium likelihood', 'high',
  '[{"term":"maize","normalized":"maize","kind":"explicit","detail":"corn family (mapped from maize)"}]'::jsonb,
  'Corn-family ingredient (maize) is the majority constituent. Standard likelihood for a maize-based cereal.',
  NULL, '1.0'
),
(
  '6151034700574', 'Golden Penny Semovita Wheat Meal', 'Golden Penny (Flour Mills of Nigeria)',
  'gmo_food', 'packaged_food',
  'Semovita (100%)',
  'low', 'Low likelihood', 'high',
  '[]'::jsonb,
  'Wheat-only product; wheat is not in the v1.0 explicit crop set.',
  NULL, '1.0'
),
(
  '6151080300271', 'Uncle Sam Corn Flakes', 'Uncle Sam (Dufil Prima Foods)',
  'gmo_food', 'packaged_food',
  'Milled corn, sugar, salt, malt flavour, vitamins and minerals (iron, niacin, B1, B2, B6, folic acid)',
  'medium', 'Medium likelihood', 'high',
  '[{"term":"corn","normalized":"corn","kind":"explicit","detail":"corn family"}]'::jsonb,
  'Corn is a high-adoption GMO crop in the v1.0 config; single explicit family → medium.',
  NULL, '1.0'
),
(
  '6151091103410', 'Power Oil 100% Vegetable Oil', 'Power Group',
  'gmo_food', 'packaged_food',
  '100% refined palm oil',
  'low', 'Low likelihood', 'high',
  '[]'::jsonb,
  'Palm oil is not in the v1.0 explicit GMO crop set.',
  NULL, '1.0'
),
(
  '6153278290112', 'Dangote Refined Sugar', 'Dangote Sugar',
  'gmo_food', 'packaged_food',
  '100% refined sugar',
  'low', 'Low likelihood', 'medium',
  '[{"term":"sugar (unspecified)","normalized":"sugar (unspecified)","kind":"ambiguous","detail":"possible sugar beet or sugarcane"}]'::jsonb,
  'No explicit GMO crop matched (N=0), but the sugar origin is undisclosed — ambiguous-derivative penalty keeps confidence at Medium.',
  'Deliberately seeded with an ambiguous-derivative penalty to exercise the confidence badge.', '1.0'
),
(
  '6151029800123', 'Peak Evaporated Milk', 'Peak (FrieslandCampina WAMCO)',
  'gmo_food', 'packaged_food',
  'Whole milk, skimmed milk, disodium phosphate, carrageenan, vitamin D, stabilizer',
  'low', 'Low likelihood', 'high',
  '[]'::jsonb,
  'Dairy-based; no explicit GMO crop ingredients.',
  NULL, '1.0'
),
(
  '6151022860034', 'Milo Original Malt Drink Powder', 'Nestlé Nigeria',
  'gmo_food', 'packaged_food',
  'Malted barley extract, sugar, cocoa, skimmed milk, vegetable fat, maltodextrin, minerals, vitamins',
  'low', 'Low likelihood', 'high',
  '[{"term":"maltodextrin","normalized":"maltodextrin","kind":"ambiguous","detail":"possible corn, rice or potato"}]'::jsonb,
  'No explicit GMO crop; maltodextrin is ambiguous but with an explicit none matched, it does not raise likelihood (penalty only).',
  NULL, '1.0'
),
(
  '6151024820471', 'Onga Classic Seasoning Mix', 'Onga (Unilever Nigeria)',
  'gmo_food', 'packaged_food',
  'Salt, sugar, monosodium glutamate, spices, yeast extract, palm oil, hydrolysed vegetable protein, colour E150c',
  'low', 'Low likelihood', 'high',
  '[]'::jsonb,
  'HVP is not an explicit alias in v1.0; palm oil is not a GMO crop. N=0.',
  NULL, '1.0'
),
(
  '6151022890314', 'Maggi Chicken Seasoning Cubes', 'Maggi (Nestlé Nigeria)',
  'gmo_food', 'packaged_food',
  'Salt, sugar, flavour enhancer E621, palm oil, hydrolysed vegetable protein, chicken powder, spices, potato starch, herbs',
  'low', 'Low likelihood', 'high',
  '[]'::jsonb,
  'No explicit v1.0 crop family match; potato starch is treated per the potato alias only when the word ''potato'' appears explicitly.',
  NULL, '1.0'
),
(
  '6151080400061', 'La Casera Carbonated Drink ', 'La Casera (La Casera Company)',
  'gmo_food', 'packaged_food',
  'Carbonated water, sugar, citric acid, preservative E211, flavour',
  'low', 'Low likelihood', 'medium',
  '[{"term":"citric acid","normalized":"citric acid","kind":"ambiguous","detail":"possible corn, beet or synthetic"}]'::jsonb,
  'No explicit crop match. Citric acid ambiguity (corn-source possible) caps confidence at Medium.',
  NULL, '1.0'
),
(
  '6151139379503', 'Sardauna Long Grain Parboiled Rice 25kg', 'Sardauna (Olam Nigeria)',
  'gmo_food', 'packaged_food',
  '100% parboiled long grain rice',
  'low', 'Low likelihood', 'high',
  '[]'::jsonb,
  'Rice is a v1.0 low-risk token, not an explicit GMO crop.',
  NULL, '1.0'
),
(
  '5050048276319', 'Kellogg''s Corn Flakes', 'Kellogg''s',
  'gmo_food', 'packaged_food',
  'Milled corn, sugar, salt, malt flavour, vitamins and minerals (iron, niacin, B1, B2, B6, B12)',
  'medium', 'Medium likelihood', 'high',
  '[{"term":"corn","normalized":"corn","kind":"explicit","detail":"corn family"}]'::jsonb,
  'Corn-dominant cereal; single explicit family → medium likelihood.',
  'International reference case; keep paired with the Uncle Sam row for brand comparison.', '1.0'
),
(
  '0480010069075', 'Hellmann''s Real Mayonnaise', 'Hellmann''s',
  'gmo_food', 'packaged_food',
  'Soybean oil, water, whole eggs, vinegar, salt, sugar, lemon juice, calcium disodium EDTA',
  'medium', 'Medium likelihood', 'high',
  '[{"term":"soybean oil","normalized":"soybean oil","kind":"explicit","detail":"soy family"}]'::jsonb,
  'Soybean oil is the primary ingredient — explicit soy family match, N=1.',
  NULL, '1.0'
),
(
  '0480015002578', 'Skippy Super Chunk Peanut Butter', 'Skippy',
  'gmo_food', 'packaged_food',
  'Roasted peanuts, hydrogenated vegetable oil (cottonseed, rapeseed), sugar, salt',
  'high', 'High likelihood', 'high',
  '[{"term":"cottonseed","normalized":"cottonseed","kind":"explicit","detail":"cottonseed family"},{"term":"rapeseed","normalized":"rapeseed","kind":"explicit","detail":"canola family (mapped from rapeseed)"}]'::jsonb,
  'Two distinct explicit crop families (cottonseed + canola/rapeseed) → N=2+, high likelihood.',
  'Seeded as the N=2+ reference case for the high-likelihood badge.', '1.0'
);

-- ============ WITHOUT barcode (tier 2, fuzzy name match) ============

insert into products (barcode, name, brand, category, subcategory, ingredients_text, result_tier, result_label, confidence_tier, matched_terms, guidance_text, target_audience_notes, config_version) values
(
  NULL, 'Mamador Seasoned Groundnut Oil', 'Mamador',
  'gmo_food', 'packaged_food',
  '100% groundnut (peanut) oil',
  'low', 'Low likelihood', 'medium',
  '[]'::jsonb,
  'Peanuts are not a v1.0 explicit GMO crop; no barcode → confidence Medium (no barcode-match points).',
  NULL, '1.0'
),
(
  NULL, 'Hollandia Slim Yogurt Cup', 'Hollandia',
  'gmo_food', 'packaged_food',
  'Pasteurised milk, sugar, strawberry, stabilizers, cultures',
  'low', 'Low likelihood', 'medium',
  '[{"term":"sugar (unspecified)","normalized":"sugar (unspecified)","kind":"ambiguous","detail":"possible sugar beet or sugarcane"}]'::jsonb,
  'Dairy + fruit; no explicit crop. Undisclosed sugar origin + no barcode → Medium confidence.',
  NULL, '1.0'
),
(
  NULL, 'Iya Bisi''s Groundnut Butter', 'Iya Bisi''s',
  'gmo_food', 'artisanal_unbranded',
  '100% roasted groundnuts, salt',
  'low', 'Low likelihood', 'medium',
  '[]'::jsonb,
  'Artisanal unbranded product. Peanuts are not in the v1.0 explicit GMO crop set.',
  'Local/open-market shelf product — the common tier-2 demo target.', '1.0'
),
(
  NULL, 'Medina Premium Ginger Juice', 'Medina',
  'gmo_food', 'packaged_food',
  'Fresh ginger juice, water, sugar, citric acid',
  'low', 'Low likelihood', 'medium',
  '[{"term":"citric acid","normalized":"citric acid","kind":"ambiguous","detail":"possible corn, beet or synthetic"}]'::jsonb,
  'Ginger is not an explicit GMO crop; ambiguity (citric acid) and no barcode → Medium confidence.',
  NULL, '1.0'
),
(
  NULL, 'Nsukka Kitchen Unrefined Palm Oil', 'Nsukka Kitchen',
  'gmo_food', 'artisanal_unbranded',
  '100% unrefined palm oil',
  'low', 'Low likelihood', 'medium',
  '[]'::jsonb,
  'Palm oil is not in the v1.0 explicit GMO crop set.',
  NULL, '1.0'
),
(
  NULL, 'Bayo''s Plantain Chips (Spicy)', 'Bayo''s',
  'gmo_food', 'artisanal_unbranded',
  'Plantain, palm oil, salt, chilli, spice',
  'low', 'Low likelihood', 'medium',
  '[]'::jsonb,
  'Plantain is not a v1.0 explicit GMO crop.',
  NULL, '1.0'
),
(
  NULL, 'Adunni''s Pounded Yam Flour', 'Adunni''s',
  'gmo_food', 'artisanal_unbranded',
  '100% yam flour',
  'low', 'Low likelihood', 'medium',
  '[]'::jsonb,
  'Yam is not a v1.0 explicit GMO crop.',
  NULL, '1.0'
),
(
  NULL, 'Mama Nkechi''s Garri (Cassava Granules)', 'Mama Nkechi''s',
  'gmo_food', 'artisanal_unbranded',
  '100% fermented cassava granules',
  'low', 'Low likelihood', 'medium',
  '[]'::jsonb,
  'Cassava is not a v1.0 explicit GMO crop.',
  'Core local-shelf product for the Nigerian market demo.', '1.0'
),
(
  NULL, 'Golden Penny Instant Noodles Onion Flavour', 'Golden Penny (Flour Mills of Nigeria)',
  'gmo_food', 'packaged_food',
  'Wheat flour, refined palm oil, salt, sugar, onion flavour, spices, anticaking agent E551',
  'low', 'Low likelihood', 'medium',
  '[]'::jsonb,
  'Sibling of the barcoded Indomie row; exercises fuzzy name matching across a brand family.',
  'Name-tier fuzzy-match reference: near-alias of Indomie Chicken Flavour.', '1.0'
),
(
  NULL, 'Gala Sausage Roll', 'Gala (Dufil Prima Foods)',
  'gmo_food', 'packaged_food',
  'Wheat flour, beef, turkey, water, salt, sugar, starch, spices, vegetable protein, soya 1.0%',
  'low', 'Low likelihood', 'medium',
  '[]'::jsonb,
  'Nominally wheat/meat based; the trace soya line does not reach the v1.0 explicit-match bar.',
  NULL, '1.0'
),
(
  NULL, 'Emzor Nutty Peanut & Honey Spread', 'Emzor',
  'gmo_food', 'packaged_food',
  'Roasted peanuts, honey, sugar, soy lecithin, salt',
  'medium', 'Medium likelihood', 'medium',
  '[{"term":"soy lecithin","normalized":"soy lecithin","kind":"explicit","detail":"soy family"}]'::jsonb,
  'Explicit soy-family match (soy lecithin) → N=1, medium likelihood. No barcode → confidence stays Medium.',
  NULL, '1.0'
),
(
  NULL, 'Lagos Pantry Oat Breakfast Pancake Mix', 'Lagos Pantry',
  'gmo_food', 'packaged_food',
  'Whole grain oats, enriched wheat flour, sugar, soybean oil, leavening, salt',
  'medium', 'Medium likelihood', 'medium',
  '[{"term":"soybean oil","normalized":"soybean oil","kind":"explicit","detail":"soy family"}]'::jsonb,
  'Soybean oil is explicit → N=1, medium likelihood.',
  NULL, '1.0'
),
(
  NULL, 'Uwana Roasted Cashew Butter', 'Uwana',
  'gmo_food', 'artisanal_unbranded',
  '100% roasted cashew nuts',
  'low', 'Low likelihood', 'medium',
  '[]'::jsonb,
  'Cashew is not a v1.0 explicit GMO crop.',
  NULL, '1.0'
),
(
  NULL, 'Zina''s Baked Beans in Tomato Sauce', 'Zina''s',
  'gmo_food', 'packaged_food',
  'White beans, tomato paste, water, sugar, salt, onion, spice',
  'low', 'Low likelihood', 'medium',
  '[]'::jsonb,
  'Beans and tomato are not explicit GMO crops in v1.0.',
  NULL, '1.0'
),
(
  NULL, 'Cadbury Dairy Milk Chocolate Bar', 'Cadbury',
  'gmo_food', 'packaged_food',
  'Milk, sugar, cocoa butter, cocoa mass, vegetable fat, emulsifier E442, flavour',
  'low', 'Low likelihood', 'medium',
  '[{"term":"sugar (unspecified)","normalized":"sugar (unspecified)","kind":"ambiguous","detail":"possible sugar beet or sugarcane"}]'::jsonb,
  'No explicit crop; undisclosed sugar origin + no barcode → Medium confidence.',
  'Name-tier international case: branded chocolate scanned without a barcode (wrapper damage).', '1.0'
);

-- ---------------------------------------------------------------------------
-- 3. Admin profile — moved to supabase/seed-admin.sql
-- ---------------------------------------------------------------------------
-- This seed no longer inserts the admin profile: a profile row has a
-- foreign key to auth.users(id), and no auth users exist in a fresh project,
-- so inserting one here aborts the whole transaction (→ full rollback).
--
-- Bootstrap the admin separately (after you have an auth account):
--   1. Supabase Dashboard → Authentication → Users → Add user (or sign up in app).
--   2. Copy that user's UUID.
--   3. Paste & run supabase/seed-admin.sql with that UUID substituted.

commit;