# GMO Likelihood Detection — Build Guide

## 1. What we're building, and the constraint that shapes everything

A photo of a label cannot prove a product contains GMO ingredients — only a lab test can. What we're building instead is a **likelihood estimate from visible evidence**: does the ingredient list contain crops known to be commonly genetically modified, and is there a certification that settles the question outright?

This constraint isn't a limitation to apologize for — it's the feature that makes the verdict trustworthy. Every verdict screen must state it in plain language: *"This estimates likelihood from the ingredients listed. It cannot confirm GMO content — only lab testing can."*

## 2. Data sources

| Source | URL | What it gives you |
|---|---|---|
| Non-GMO Project High-Risk List | nongmoproject.org/risk-status/ | The seed crop list — alfalfa, apple, canola, corn, cotton, papaya, potato, soy, sugar beet, zucchini |
| Non-GMO Project GMO FAQ | nongmoproject.org/gmo-faq/ | The ambiguous-derivative ingredient list (citric acid, maltodextrin, unspecified "vegetable X," etc.) |
| USDA AMS Bioengineered Foods List | ams.usda.gov/rules-regulations/be/bioengineered-foods-list | Regulatory ground truth to cite; per-crop PDF fact sheets with derivative examples; also lists eggplant, pineapple, sugarcane as lower-priority additions |
| Open Food Facts | world.openfoodfacts.org | Barcode/product matching, bulk data export (JSONL/CSV/Parquet) for real ingredient text to test against, and an existing ingredient taxonomy that may shortcut your own text normalization |

## 3. The lookup table

### 3.1 Certification short-circuit — check this FIRST, before any ingredient matching

| Term |
|---|
| Non-GMO Project Verified |
| USDA Organic |
| Certified Organic |
| EU Organic |

If any of these appear in the OCR'd text or product metadata: **Likelihood = Low, Confidence = High, stop.** A certification is stronger evidence than any ingredient match — don't let ingredient scoring override it.

### 3.2 Explicit crop matches (strong evidence — these count toward the likelihood score)

| Crop family | Aliases to match |
|---|---|
| corn | corn, corn starch, cornstarch, corn syrup, high fructose corn syrup, corn oil, dextrose (corn-derived) |
| soy | soy, soybean, soybean oil, soy lecithin, soy protein, textured vegetable protein |
| canola | canola, canola oil, rapeseed oil |
| cotton | cotton, cottonseed, cottonseed oil |
| sugar_beet | sugar beet, beet sugar |
| alfalfa | alfalfa |
| papaya | papaya (Hawaiian papaya specifically — ringspot virus resistance breeding) |
| apple | apple (Arctic varieties — non-browning trait) |
| potato | potato |
| zucchini | zucchini, summer squash |

**Lower priority — present on USDA's list only, check relevance to your target shelf before including:** eggplant (BARI Bt Begun varieties), sugarcane (Bt insect-resistant varieties).

### 3.3 Ambiguous derivative matches (weak evidence — the label doesn't disclose the source crop)

| Ingredient | Why it's ambiguous |
|---|---|
| citric acid | Corn, beet, or synthetic — can't tell from the label |
| ascorbic acid | Corn or synthetic |
| maltodextrin | Corn, rice, or potato |
| vegetable oil (unspecified) | Soy, canola, corn, or palm |
| natural flavors | Carrier/base varies widely, undisclosed |
| xanthan gum | Corn, soy, or wheat |
| sugar (unspecified) | Sugar beet or sugarcane |
| molasses | Sugar beet or sugarcane |
| cellulose | Various plant sources, rarely disclosed |
| soy hemoglobin | Soy — used in some plant-based meat products |
| any unspecified "vegetable [X]" | Non-GMO Project explicitly flags this pattern as ambiguous |

**Critical design point:** these ingredients never increase the likelihood score. Their presence lowers *confidence* — it means the evidence is genuinely inconclusive, not that GMO content is more likely.

## 4. The matching pipeline, step by step

1. OCR extracts the back-label ingredients text.
2. Normalize: lowercase, strip punctuation, split on commas into tokens.
3. Run the certification check. If matched, stop here (see 3.1).
4. Match each token against `explicit_crop_matches`. Track the **set of distinct crop families** matched (not raw ingredient count).
5. Match each token against `ambiguous_derivative_matches`. Track the count of ambiguous hits.
6. Compute likelihood from the distinct-family count (N) — see section 5.
7. Compute confidence from the points formula — see section 6.
8. Assemble the verdict screen output (section 8).

## 5. Likelihood scoring

| N (distinct crop families matched) | Likelihood |
|---|---|
| 0 | Low |
| 1 | Medium |
| 2 or more | High |

Use distinct families, not raw ingredient count — "corn syrup, corn starch, modified corn starch" is still just corn (N=1, Medium), not High. This keeps a single-crop product from over-scoring just because that crop appears in multiple derivative forms.

## 6. Confidence scoring

| Factor | Condition | Points |
|---|---|---|
| Ingredient list completeness | Full list OCR'd, no visible truncation | +2 |
| Product identification | Barcode/name matched an Open Food Facts entry | +2 |
| Lookup match rate | ≥80% of extracted ingredients recognized (explicit, ambiguous, or known-irrelevant) | +1 |
| Certification clarity | Cert statement clearly readable either way (has one, or explicitly none) | +1 |
| Ambiguous-derivative penalty | One or more ambiguous derivatives matched with no explicit crop found elsewhere | −1 |

| Total points | Confidence |
|---|---|
| 4–5 | High |
| 2–3 | Medium |
| 0–1 or negative | Low |

## 7. Worked example

Ingredients: "corn syrup, soybean oil, citric acid, salt, natural flavors." No certification found.

- Explicit matches: corn (from "corn syrup"), soy (from "soybean oil") → N = 2 → **Likelihood: High**
- Ambiguous matches: citric acid, natural flavors → confidence penalty applies
- Confidence: full list read (+2), no barcode match (+0), most ingredients recognized (+1), no cert info (+1), ambiguous penalty (−1) → 3 points → **Medium confidence**
- Verdict text: *"High GMO Likelihood — Medium Confidence — 2 crops detected (corn, soy); some ingredients like citric acid and natural flavors couldn't be traced to a source."*

## 8. Verdict screen — fields to show

| Field | Source |
|---|---|
| Product Name / Brand | OCR or barcode match |
| Result (Low/Medium/High GMO Likelihood) | Computed — likelihood scoring |
| Confidence (High/Medium/Low) | Computed — confidence scoring, shown as a *separate* badge, never merged with Result |
| Matched Ingredient(s) | The specific crop names / ambiguous terms that were found |
| Certification (if any) | Only shown if detected |
| Why It Matters | The honesty-constraint sentence, always shown, non-negotiable |

## 9. Submission form — shown when confidence is Low

| Field | Notes |
|---|---|
| Product name | Pre-filled from OCR guess, editable |
| Brand | Pre-filled if available |
| Ingredients text | Pre-filled from OCR, editable — this is the actual correction step |
| Certification visible on packaging, if any | Dropdown or "none visible" |
| Photo | Auto-attached from capture, don't re-ask |

## 10. Admin review queue

Shows the submission fields above, plus a live preview of what the rules engine would compute from the (corrected) ingredients text. Admin approves, edits, or rejects. Approval writes a new row into the verified product dataset with a new Product ID.

## 11. Build order

1. Text normalization + tokenization (shared code, reusable elsewhere in the app)
2. Matching function against both lookup tiers, tracking N and ambiguous count
3. Likelihood + confidence scoring functions (pure functions, easy to unit test)
4. Wire into verdict screen + low-confidence submission trigger
5. Admin review queue (approve/reject → writes to verified dataset)
6. Validate against a real sample pulled from Open Food Facts' bulk export before calling it done

## 12. Open questions to resolve before calling this v1

- Cross-check the full crop and ambiguous lists against a real sample of packaged snack/cereal ingredient text — this draft is sourced from Non-GMO Project and USDA lists but not yet stress-tested the way the fluoride dataset was.
- Decide whether eggplant and sugarcane (USDA-only, lower priority) are worth including given your target market.
- Confirm whether Open Food Facts' existing ingredient tags (e.g. `en:corn-starch`) can be matched directly instead of building custom regex — could save real dev time.
