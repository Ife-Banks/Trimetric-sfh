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
--  * Oral-care products ARE seeded (Phase 6 shipped). The published fluoride
--    ruleset is v1.3; stored oral-care verdicts were computed by
--    src/engines/fluorideEngine.ts against data/fluoride_lookup_config_v1.3.json.
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
      { "crop_family": "zucchini", "aliases": ["zucchini", "summer squash"] },
      { "crop_family": "salmon", "aliases": ["salmon", "pink salmon", "red salmon", "smoked salmon", "natural salmon", "oncorhynchus gorbuscha", "oncorhynchus nerka"] }
    ]
  },
  "ambiguous_derivative_matches": {
    "note": "Ingredients that MAY derive from a GMO crop but the label does not disclose the source. Presence lowers confidence, not likelihood. The ''any unspecified vegetable [X]'' catch-all is enforced in engine code (gmoEngine.classifyToken), not as fixed phrases here.",
    "entries": [
      { "ingredient": "citric acid", "possible_sources": ["corn", "beet", "synthetic"] },
      { "ingredient": "food acid", "possible_sources": ["corn", "beet", "synthetic"] },
      { "ingredient": "ascorbic acid", "possible_sources": ["corn", "synthetic"] },
      { "ingredient": "maltodextrin", "possible_sources": ["corn", "rice", "potato"] },
      { "ingredient": "vegetable oil (unspecified)", "possible_sources": ["soy", "canola", "corn", "palm"] },
      { "ingredient": "natural flavors", "possible_sources": ["unknown"] },
      { "ingredient": "xanthan gum", "possible_sources": ["corn", "soy", "wheat"] },
      { "ingredient": "sugar (unspecified)", "possible_sources": ["sugar beet", "sugarcane"] },
      { "ingredient": "molasses", "possible_sources": ["sugar beet", "sugarcane"] },
      { "ingredient": "cellulose", "possible_sources": ["various plant sources"] },
      { "ingredient": "soy hemoglobin", "possible_sources": ["soy"] }
    ]
  },
  "low_risk_tokens": [
    "salt", "water", "vinegar", "pepper", "garlic", "onion", "spices",
    "sugar", "molasses", "honey", "oil", "vegetable oil", "flour", "rice",
    "wheat", "natural flavors", "natural flavoring", "monk fruit", "stevia",
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

insert into lookup_config (category, version, config_json, is_published, published_at)
values (
  'oral_care',
  '1.3',
  '{
  "project": "SHF Fluoride Detection & Lookup Architecture",
  "version": "1.3",
  "scope_note": "Oral care only for 4-week MVP (toothpaste/gel + mouthwash/rinse). Water, salt, and milk/formula category tables removed from scope — see v1.1 if that gets revisited later.",
  "changelog_from_1.1": [
    "Removed FL06 potassium fluoride (salt-specific, out of scope)",
    "Removed category_detection block — every scanned product is oral care by definition now",
    "Removed water_beverages, salt, milk_formula threshold tables",
    "Removed ''category could not be determined'' from LOW_CONFIDENCE reasons",
    "Kept multi-language synonyms — imported oral-care brands still show non-English labels"
  ],
  "changelog_from_1.2": [
    "Added verdict_screen_schema — maps Product_Master_Dataset columns to computed vs. admin-curated fields",
    "Added submission_form_schema — the fields collected when confidence is Low/No-data",
    "Added admin_review_schema — what the review queue shows and what approval writes"
  ],
  "terms_lookup_table": [
    {
      "term_id": "FL01",
      "raw_term": "sodium fluoride",
      "normalized_term": "Sodium Fluoride",
      "synonyms": "NaF, Natrium Fluoride, E954 (contextual), fluorure de sodium, Natriumfluorid, fluoruro de sodio, natriumfluoridi, fluorid sodný",
      "compound_type": "Active Fluoride",
      "std_concentration_wt": "0.243%",
      "ppm_multiplier": 4500,
      "default_ppm": 1100,
      "regex_pattern": "\\b(sodium\\s+fluoride|naf|fluorure\\s+de\\s+sodium|natriumfluorid|fluoruro\\s+de\\s+sodio|natriumfluoridi|fluorid\\s+sodn[yý])\\b"
    },
    {
      "term_id": "FL02",
      "raw_term": "stannous fluoride",
      "normalized_term": "Stannous Fluoride",
      "synonyms": "SnF2, Tin(II) Fluoride",
      "compound_type": "Active Fluoride",
      "std_concentration_wt": "0.454%",
      "ppm_multiplier": 2420,
      "default_ppm": 1100,
      "regex_pattern": "\\b(stannous\\s+fluoride|snf2|tin\\s+fluoride)\\b"
    },
    {
      "term_id": "FL03",
      "raw_term": "sodium monofluorophosphate",
      "normalized_term": "Sodium Monofluorophosphate",
      "synonyms": "SMFP, MFP, Na2PO3F",
      "compound_type": "Active Fluoride",
      "std_concentration_wt": "0.76%",
      "ppm_multiplier": 1315,
      "default_ppm": 1000,
      "regex_pattern": "\\b(sodium\\s+monofluorophosphate|smfp|mfp|na2po3f)\\b"
    },
    {
      "term_id": "FL04",
      "raw_term": "amine fluoride",
      "normalized_term": "Amine Fluoride",
      "synonyms": "Olaflur, Dectaflur",
      "compound_type": "Active Fluoride",
      "std_concentration_wt": "1.00%",
      "ppm_multiplier": 1400,
      "default_ppm": 1400,
      "regex_pattern": "\\b(amine\\s+fluoride|olaflur|dectaflur)\\b"
    },
    {
      "term_id": "FL05",
      "raw_term": "acidulated phosphate fluoride",
      "normalized_term": "Acidulated Phosphate Fluoride",
      "synonyms": "APF",
      "compound_type": "Active Fluoride",
      "std_concentration_wt": "1.23%",
      "ppm_multiplier": 10000,
      "default_ppm": 12300,
      "regex_pattern": "\\b(acidulated\\s+phosphate\\s+fluoride|apf)\\b"
    },
    {
      "term_id": "NFL01",
      "raw_term": "nano-hydroxyapatite",
      "normalized_term": "Nano-hydroxyapatite",
      "synonyms": "nHAp, Hydroxyapatite, Micro-hydroxyapatite",
      "compound_type": "Fluoride Alternative",
      "default_ppm": 0,
      "classification": "Fluoride-Free",
      "regex_pattern": "\\b(nano[- ]?hydroxyapatite|nhap|hydroxyapatite)\\b"
    },
    {
      "term_id": "NFL02",
      "raw_term": "calcium carbonate",
      "normalized_term": "Calcium Carbonate",
      "synonyms": "Chalk, Limestone, CaCO3",
      "compound_type": "Abrasive / Non-Fluoride Active",
      "default_ppm": 0,
      "classification": "Fluoride-Free",
      "regex_pattern": "\\b(calcium\\s+carbonate|caco3)\\b"
    },
    {
      "term_id": "NFL03",
      "raw_term": "sodium bicarbonate",
      "normalized_term": "Sodium Bicarbonate",
      "synonyms": "Baking Soda, NaHCO3",
      "compound_type": "Abrasive / Non-Fluoride Active",
      "default_ppm": 0,
      "classification": "Fluoride-Free",
      "regex_pattern": "\\b(sodium\\s+bicarbonate|baking\\s+soda)\\b"
    },
    {
      "term_id": "NFL04",
      "raw_term": "xylitol",
      "normalized_term": "Xylitol",
      "synonyms": "Birch Sugar",
      "compound_type": "Sweetener / Non-Fluoride Active",
      "default_ppm": 0,
      "classification": "Fluoride-Free",
      "regex_pattern": "\\b(xylitol)\\b"
    }
  ],
  "subcategory_detection": {
    "note": "Only two subcategories to distinguish within oral care — much simpler than the dropped multi-category version. Can be a single keyword check or even a manual toggle on the capture screen if OCR-based detection isn''t reliable in time.",
    "toothpaste_gel_keywords": [
      "toothpaste",
      "dentifrice",
      "gel",
      "zahncreme",
      "pasta de dientes"
    ],
    "mouthwash_rinse_keywords": [
      "mouthwash",
      "rinse",
      "mondwater",
      "collutorio"
    ],
    "fallback": "If neither keyword set matches, default to toothpaste_gel table (larger of the two categories) and cap confidence at Medium."
  },
  "category_ppm_tables": {
    "toothpaste_gel": [
      {
        "tier": "Low (Children''s)",
        "ppm_range": [
          250,
          500
        ],
        "verdict": "Low Fluoride Content",
        "guidance": "Formulated for young toddlers to reduce fluorosis risk if swallowed."
      },
      {
        "tier": "Standard (Adult OTC)",
        "ppm_range": [
          1000,
          1500
        ],
        "verdict": "Standard Fluoride Content",
        "guidance": "Typical daily adult cavity protection level."
      },
      {
        "tier": "High (Prescription/Clinical)",
        "ppm_range": [
          5000,
          25000
        ],
        "verdict": "High Fluoride Content — Prescription Strength",
        "guidance": "Dentist-prescribed or in-office use only; not typical daily OTC strength."
      },
      {
        "tier": "Fluoride-Free",
        "ppm_range": [
          0,
          0
        ],
        "verdict": "Fluoride-Free"
      }
    ],
    "mouthwash_rinse": [
      {
        "tier": "Low",
        "ppm_range": [
          0,
          99
        ],
        "verdict": "Low Fluoride Content"
      },
      {
        "tier": "Standard (Daily Rinse)",
        "ppm_range": [
          100,
          250
        ],
        "verdict": "Standard Fluoride Content",
        "guidance": "Typical daily anticavity rinse strength."
      },
      {
        "tier": "High",
        "ppm_range": [
          251,
          1000
        ],
        "verdict": "High Fluoride Content"
      },
      {
        "tier": "Fluoride-Free",
        "ppm_range": [
          0,
          0
        ],
        "verdict": "Fluoride-Free"
      }
    ]
  },
  "confidence_scoring_rules": {
    "high_confidence_threshold": 0.9,
    "medium_confidence_threshold": 0.6,
    "low_confidence_threshold": 0.01,
    "trigger_user_input_below": 0.6,
    "triggers": [
      {
        "status": "LOW_CONFIDENCE",
        "confidence_score_range": "[0.01, 0.59]",
        "action": "PROMPT_USER_INPUT",
        "reasons": [
          "Ambiguous compound name matched without concentration",
          "Conflicting text tokens (e.g. both ''Fluoride-Free'' and ''Sodium Fluoride'' detected)",
          "OCR text extraction quality below 60%",
          "Unusual concentration for detected subcategory (out-of-bounds anomaly)"
        ],
        "ui_prompt": "We found fluoride terms, but couldn''t verify exact details. Please select your product type or confirm ingredients."
      },
      {
        "status": "NO_DATA",
        "confidence_score_range": "0.00",
        "action": "PROMPT_USER_INPUT",
        "reasons": [
          "Zero matched terms in ingredients text",
          "Barcode not found in master database",
          "OCR pipeline failed to extract readable text"
        ],
        "ui_prompt": "We couldn''t recognize this product. Please enter the product name or scan the active ingredients list."
      }
    ]
  },
  "verdict_screen_schema": {
    "note": "Field list mirrors Product_Master_Dataset columns. ''source: computed'' fields come from the rules engine; ''source: admin_curated'' fields are optional and only appear when a human has added them to a verified product — never auto-generated.",
    "fields": [
      {
        "field": "Product Name / Brand",
        "source": "ocr_or_barcode_match",
        "always_shown": true
      },
      {
        "field": "Result",
        "source": "computed",
        "from": "category_ppm_tables[subcategory].verdict",
        "always_shown": true,
        "ui": "primary color-coded badge"
      },
      {
        "field": "Confidence",
        "source": "computed",
        "from": "confidence_scoring_rules",
        "always_shown": true,
        "ui": "secondary badge, shown alongside Result, never merged into one badge"
      },
      {
        "field": "Strength Classification",
        "source": "computed",
        "from": "category_ppm_tables[subcategory].tier",
        "always_shown": true
      },
      {
        "field": "Active Compound",
        "source": "computed",
        "from": "terms_lookup_table match + extracted concentration",
        "always_shown": true
      },
      {
        "field": "Why It Matters",
        "source": "computed",
        "from": "category_ppm_tables[subcategory].guidance",
        "always_shown": true,
        "ui": "plain-language subtext under the badges"
      },
      {
        "field": "Target Audience / Usage Notes",
        "source": "admin_curated",
        "always_shown": false,
        "note": "Not computable from PPM tier alone — specific context like ''orthodontic patients 6+'' requires human judgment. Blank unless an admin previously enriched this exact verified product."
      }
    ]
  },
  "submission_form_schema": {
    "note": "Shown when confidence is Low or No-data. Only asks for what the engine couldn''t determine — no Why It Matters or Target Audience fields here, those are admin-added at review time.",
    "fields": [
      {
        "field": "Product name",
        "prefill": "OCR guess if available",
        "required": true
      },
      {
        "field": "Brand",
        "prefill": "OCR guess if available",
        "required": false
      },
      {
        "field": "Subcategory",
        "input": "dropdown: toothpaste_gel | mouthwash_rinse",
        "required": true,
        "note": "Drives which category_ppm_tables entry applies"
      },
      {
        "field": "Ingredients text",
        "prefill": "OCR extraction, editable",
        "required": true,
        "note": "This is the actual correction step — most submissions will just be fixing OCR errors here"
      },
      {
        "field": "Active compound (if visible on packaging)",
        "input": "dropdown from terms_lookup_table, or ''not sure''",
        "required": false
      },
      {
        "field": "Concentration/PPM as printed",
        "input": "free text",
        "required": false
      },
      {
        "field": "Photo",
        "source": "auto-attached from capture step",
        "required": true,
        "note": "Do not re-ask — already captured"
      }
    ]
  },
  "admin_review_schema": {
    "shown_per_submission": [
      "All submission_form_schema fields as submitted by the user",
      "Live preview: what Result / Strength Classification / Active Compound the rules engine computes from the (corrected) ingredients text",
      "Approve / Reject actions"
    ],
    "on_approve": "Writes a new row into Product_Master_Dataset with a new Product ID. Result, Strength Classification, and Active Compound come from the computed preview (admin may hand-edit before approving). Target Audience/Usage Notes stays blank unless the admin fills it in manually.",
    "on_reject": "Submission status set to rejected, not written to Product_Master_Dataset. No user-facing notification required for MVP."
  }
}'::jsonb,
  true,
  now()
)
on conflict (category, version) do update
  set config_json = excluded.config_json,
      is_published = excluded.is_published,
      published_at = excluded.published_at;

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
  'low', 'Low likelihood', 'high',
  '[]'::jsonb,
  'Sibling of the barcoded Indomie row; full wheat/palm-oil list recognized at ≥80% → high-confidence read of a low-likelihood recipe. Exercises fuzzy name matching across a brand family.',
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


-- ---------------------------------------------------------------------------
-- 4. Phase 6 additions — oral_care first (dataset balance), then diverse GMO
-- ---------------------------------------------------------------------------

insert into products (barcode, name, brand, category, subcategory, ingredients_text, result_tier, result_label, confidence_tier, matched_terms, guidance_text, target_audience_notes, config_version) values
(
  '8850007817734', 'Listerine Total Care – 100ml', 'Listerine',
  'oral_care', 'mouthwash_rinse',
  'Water, Sorbitol, Propylene Glycol, Poloxamer 407, Sodium Lauryl Sulfate, Eucalyptol, Zinc Chloride, Benzoic Acid, Sodium Benzoate, Thymol, Sodium Saccharin, Methyle Salicylate, Flavor, Sodium Fluoride, Menthol, Aroma, Sucralose, CI 16035, CI 42090, contains 220ppm of fluoride when packed',
  'medium', 'Standard Fluoride Content', 'medium',
  '[{"term":"sodium fluoride","normalized":"Sodium Fluoride","kind":"active_compound"}]'::jsonb,
  'Typical daily adult cavity protection level.',
  'Oral-care seed row (Odunayo product search) — seeded to balance category coverage.', '1.3'
),
(
  '5054563126450', 'Parodontax Mondwater extra fresh – 500ml', 'Parodontax',
  'oral_care', 'mouthwash_rinse',
  'Aqua, Glycerin, PEG-60 Hydrogenated Castor Oil, Sodium Citrate, Sodium Lauryl Sulfate, Aroma, Menthol, Methylparaben, Propylparaben, Zinc Chloride, Gellan Gum, o-cymen-5-ol, Sodium Fluoride, Sodium Saccharin, Mentha Piperita Oil, Anethole, CI 17200. Bevat NATRIUMFLUORIDE (225ppm F)',
  'medium', 'Standard Fluoride Content', 'medium',
  '[{"term":"sodium fluoride","normalized":"Sodium Fluoride","kind":"active_compound"}]'::jsonb,
  'Typical daily adult cavity protection level.',
  'Oral-care seed row (Odunayo product search) — seeded to balance category coverage.', '1.3'
),
(
  '2002458969692', 'Multi-Action Toothpaste – Glister', 'Glister',
  'oral_care', 'toothpaste_gel',
  'Aqua, Sorbitol, Hydrated Silica, Glycerin, Propylene Glycol, Sodium Lauryl Sulfate, Xylitol, Cellulose Gum, PEG-8, Aroma, CI 77891, Sodium Benzoate, Xanthan Gum, Sodium Fluoride, Sodium Saccharin, CI 42090, Limonene.',
  'medium', 'Standard Fluoride Content', 'medium',
  '[{"term":"sodium fluoride","normalized":"Sodium Fluoride","kind":"active_compound"},{"term":"xylitol","normalized":"Xylitol","kind":"active_compound"}]'::jsonb,
  'Typical daily adult cavity protection level.',
  'Oral-care seed row (Odunayo product search) — seeded to balance category coverage.', '1.3'
),
(
  '4026600015127', 'Odol-med3 – 125ml', NULL,
  'oral_care', 'toothpaste_gel',
  'Aqua. Hydrated Silica. Sorbitol. Glycerin Sodium Lauryl Sulfate. Xanthan Gum, Aroma. Titanium Dioxide. PEG-6. Sodium Fluoride. Sodium Saccharin, Carrageenan, Limonene, CI 73360. CI 74160',
  'medium', 'Standard Fluoride Content', 'medium',
  '[{"term":"sodium fluoride","normalized":"Sodium Fluoride","kind":"active_compound"}]'::jsonb,
  'Typical daily adult cavity protection level.',
  'Oral-care seed row (Odunayo product search) — seeded to balance category coverage.', '1.3'
),
(
  '4326470542540', 'Elina dent Zahncreme', NULL,
  'oral_care', 'toothpaste_gel',
  'Aqua, Glycerin, Hydrated Silica, Sorbitol, Cellulose Gum, C14-16 Olefin Sulfonate, Aroma, Sodium Fluoride, Sodium Methylparaben, Sodium Saccharin CI 14720. Enthalt: Natriumfluorid (500 ppm F)',
  'low', 'Low Fluoride Content', 'medium',
  '[{"term":"sodium fluoride","normalized":"Sodium Fluoride","kind":"active_compound"}]'::jsonb,
  'Formulated for young toddlers to reduce fluorosis risk if swallowed.',
  'Oral-care seed row (Odunayo product search) — seeded to balance category coverage.', '1.3'
),
(
  '0819156023234', 'Natural Friendly', 'Hello',
  'oral_care', 'toothpaste_gel',
  'calcium carbonate, hydrated silica, purified water, vegetable glycerin, sodium lauryl sulfate (coconut derived), carrageenan, flavor, sodium fluoride, zinc citrate, sodium bicarbonate, xylitol, sodium cocoyl glutamate, stevia rebaudiana leaf extract, potassium sorbate, organic tea tree oil, organic coconut oil',
  'medium', 'Standard Fluoride Content', 'medium',
  '[{"term":"sodium fluoride","normalized":"Sodium Fluoride","kind":"active_compound"},{"term":"calcium carbonate","normalized":"Calcium Carbonate","kind":"active_compound"},{"term":"sodium bicarbonate","normalized":"Sodium Bicarbonate","kind":"active_compound"},{"term":"xylitol","normalized":"Xylitol","kind":"active_compound"}]'::jsonb,
  'Typical daily adult cavity protection level.',
  'Oral-care seed row (Odunayo product search) — seeded to balance category coverage.', '1.3'
),
(
  NULL, 'Colgate-Triple Action', 'Triple Action',
  'oral_care', 'toothpaste_gel',
  'Sodium monofluorophosphate',
  'medium', 'Standard Fluoride Content', 'medium',
  '[{"term":"sodium monofluorophosphate","normalized":"Sodium Monofluorophosphate","kind":"active_compound"}]'::jsonb,
  'Typical daily adult cavity protection level.',
  'Oral-care seed row (Odunayo product search) — seeded to balance category coverage.', '1.3'
),
(
  NULL, 'oral B', NULL,
  'oral_care', 'toothpaste_gel',
  'Sorbitol, Aqua, Hydrated Silica, Aroma, Cellulose gum, Sodium phosphate, Sodium Fluoride, Mica, Limeonene.',
  'medium', 'Standard Fluoride Content', 'medium',
  '[{"term":"sodium fluoride","normalized":"Sodium Fluoride","kind":"active_compound"}]'::jsonb,
  'Typical daily adult cavity protection level.',
  'Oral-care seed row (Odunayo product search) — seeded to balance category coverage.', '1.3'
);

insert into products (barcode, name, brand, category, subcategory, ingredients_text, result_tier, result_label, confidence_tier, matched_terms, guidance_text, target_audience_notes, config_version) values
(
  '0073472001202', 'EZEKIEL 4:9 FLOURLESS SPROUTED GRAIN BREAD', 'Food For Life',
  'gmo_food', 'packaged_food',
  'organic sprouted wheat, filtered water, organic sprouted barley, organic sprouted millet, organic malted barley, organic sprouted lentils, organic sprouted soybeans, organic sprouted spelt, fresh yeast,organic wheat gluten, sea salt.',
  'medium', 'Medium GMO Likelihood', 'high',
  '[{"term":"organic sprouted soybeans","normalized":"soy","kind":"explicit","detail":"soy"}]'::jsonb,
  'This estimates likelihood from the ingredients listed. It cannot confirm GMO content — only lab testing can.',
  'Validation-set seed row (SHF GMO ingredient lists) — seeded for category variety.', '1.0'
),
(
  '6111180007339', 'Chocao', 'Chocao',
  'gmo_food', 'packaged_food',
  'sugar: 59.0%, cocoa powder: 25.0%, corn starch: 8.4%, E412: 4.8%, flavouring: 3.0%, vanilla flavouring: 3.0%, chocolate: < 2%',
  'medium', 'Medium GMO Likelihood', 'high',
  '[{"term":"corn starch  8 4","normalized":"corn","kind":"explicit","detail":"corn"}]'::jsonb,
  'This estimates likelihood from the ingredients listed. It cannot confirm GMO content — only lab testing can.',
  'Validation-set seed row (SHF GMO ingredient lists) — seeded for category variety.', '1.0'
),
(
  '7613037397956', 'Burger Soja', 'Garden gourmet',
  'gmo_food', 'packaged_food',
  'water, concentrated soy protein (18,5%), vegetable oils (colza, coconut), natural aromas, wheat gluten, stabilizer: methyl cellulose, alcohol vinegar, fruit and vegetable concentrate (betterave, carrot, pepper, blackcurrant), salt, barley malt extract, '',gmo-free',
  'medium', 'Medium GMO Likelihood', 'high',
  '[{"term":"concentrated soy protein  18","normalized":"soy","kind":"explicit","detail":"soy"},{"term":"vegetable oils  colza","normalized":"ambiguous derivative","kind":"ambiguous","detail":"may derive from a GMO crop, source not disclosed on label"},{"term":"stabilizer  methyl cellulose","normalized":"ambiguous derivative","kind":"ambiguous","detail":"may derive from a GMO crop, source not disclosed on label"},{"term":"fruit and vegetable concentrate  betterave","normalized":"ambiguous derivative","kind":"ambiguous","detail":"may derive from a GMO crop, source not disclosed on label"}]'::jsonb,
  'This estimates likelihood from the ingredients listed. It cannot confirm GMO content — only lab testing can.',
  'Validation-set seed row (SHF GMO ingredient lists) — seeded for category variety.', '1.0'
),
(
  '6430081490201', 'Oddlygood Wicked vanilla soygurt', 'Oddlygood',
  'gmo_food', 'packaged_food',
  'Water, 9% peeled soybeans (North-America), sugar, polydextrose (dietary fibre), sugarcane, modified starch, vitamins (D2, riboflavin (B2), B12, folic acid), calcium, aromas, stabiliser (pectin), salt, ground vanilla pod, acidity regulator (citric acid), preservative (potassium sorbate), starter.',
  'medium', 'Medium GMO Likelihood', 'high',
  '[{"term":"9  peeled soybeans  north-america","normalized":"soy","kind":"explicit","detail":"soy"},{"term":"acidity regulator  citric acid","normalized":"ambiguous derivative","kind":"ambiguous","detail":"may derive from a GMO crop, source not disclosed on label"}]'::jsonb,
  'This estimates likelihood from the ingredients listed. It cannot confirm GMO content — only lab testing can.',
  'Validation-set seed row (SHF GMO ingredient lists) — seeded for category variety.', '1.0'
),
(
  '0068400662600', 'Mayonnaise –', 'Hellmann''s',
  'gmo_food', 'packaged_food',
  'Canola oil, water, liquid whole egg, vinegar, liquid egg yolk, salt, sugar, spice, concentrated lemon juice, calcium disodium EDTA.',
  'medium', 'Medium GMO Likelihood', 'high',
  '[{"term":"canola oil","normalized":"canola","kind":"explicit","detail":"canola"}]'::jsonb,
  'This estimates likelihood from the ingredients listed. It cannot confirm GMO content — only lab testing can.',
  'Validation-set seed row (SHF GMO ingredient lists) — seeded for category variety.', '1.0'
),
(
  NULL, 'Wild salmon fillets', 'Sainsbury''s',
  'gmo_food', 'packaged_food',
  'pink salmon (oncorhynchus gorbuscha)',
  'medium', 'Medium GMO Likelihood', 'high',
  '[{"term":"pink salmon  oncorhynchus gorbuscha","normalized":"salmon","kind":"explicit","detail":"salmon"}]'::jsonb,
  'This estimates likelihood from the ingredients listed. It cannot confirm GMO content — only lab testing can.',
  'Validation-set seed row (SHF GMO ingredient lists) — seeded for category variety.', '1.0'
),
(
  '0096619256976', 'Smoked Salmon –', 'Kirkland Signature',
  'gmo_food', 'packaged_food',
  'smoked salmon',
  'medium', 'Medium GMO Likelihood', 'high',
  '[{"term":"smoked salmon","normalized":"salmon","kind":"explicit","detail":"salmon"}]'::jsonb,
  'This estimates likelihood from the ingredients listed. It cannot confirm GMO content — only lab testing can.',
  'Validation-set seed row (SHF GMO ingredient lists) — seeded for category variety.', '1.0'
),
(
  '5099874252436', 'Papaya Goats Cheese', 'Dunnes Stores',
  'gmo_food', 'packaged_food',
  'Goat''s Cheese (83%) [Pasteurised Goat''s Milk, Salt, Sequestrant: Calcium Chloride; Vegetarian Rennet, Lactic Acid Starter Culture (Milk)], Papaya (17%) [Papaya, Cane Sugar].',
  'medium', 'Medium GMO Likelihood', 'high',
  '[{"term":"papaya  17    papaya","normalized":"papaya","kind":"explicit","detail":"papaya"}]'::jsonb,
  'This estimates likelihood from the ingredients listed. It cannot confirm GMO content — only lab testing can.',
  'Validation-set seed row (SHF GMO ingredient lists) — seeded for category variety.', '1.0'
);

commit;