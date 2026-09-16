# Fluoride Detection — Build Guide (Oral Care + Supplements)

## 1. What we're building

Unlike GMO detection, fluoride is usually stated explicitly on a label — "sodium fluoride 0.243%," "1450 ppm F." This is closer to **keyword detection with arithmetic** than probabilistic inference: find the compound, find the concentration near it, convert to ppm, classify against a threshold table for the product's category.

## 2. Scope: two product families, two levels of readiness

- **Oral care (toothpaste, mouthwash)** — the MVP core. Fully spec'd, validated against a real product dataset, ready to build first.
- **Dietary/dental fluoride supplements** — an extension. Genuinely harder, because safe dosing depends on the user's age and their *local water fluoride level* — something a photo of a product cannot see. Build this after oral care works, and keep its output strictly informational (see section 6.3).

## 3. Data sources

| Source | What it gives you |
|---|---|
| FDA OTC Anticaries Drug Products monograph | Authoritative PPM ranges for toothpaste and rinse — the 850–1150 ppm adult range, 500 ppm children's range, prescription-strength thresholds |
| ADA (American Dental Association) fluoride guidance | Cross-check for the same thresholds, consumer-facing framing |
| ADA/AAPD Fluoride Supplementation Schedule | The official age × local-water-fluoride-level dosage table for supplements — reference only, see 6.3 for why the app shouldn't compute personalized doses from it |
| Open Beauty Facts (`world.openbeautyfacts.org`) | **Not Open Food Facts** — toothpaste and mouthwash are personal care products, not food, and live in OFF's sister database. Has a Toothpastes category facet and the same API shape (`/api/v2/product/[barcode].json`) |
| Manually collected supplement product photos | Fluoride supplement products are a much smaller, mostly-prescription market — there's no large public dataset equivalent to Open Beauty Facts for this category, so expect to hand-collect a small sample |

## 4. Lookup table — active compounds

| ID | Compound | Synonyms (incl. common EU languages) | Concentration form | PPM multiplier | Default PPM (if no % found) |
|---|---|---|---|---|---|
| FL01 | Sodium Fluoride | NaF, fluorure de sodium, Natriumfluorid, fluoruro de sodio, natriumfluoridi, fluorid sodný | wt% | 4500 | 1100 |
| FL02 | Stannous Fluoride | SnF2, Tin(II) Fluoride | wt% | 2420 | 1100 |
| FL03 | Sodium Monofluorophosphate | SMFP, MFP, Na2PO3F | wt% | 1315 | 1000 |
| FL04 | Amine Fluoride | Olaflur, Dectaflur | wt% | 1400 | 1400 |
| FL05 | Acidulated Phosphate Fluoride | APF | wt% | 10000 | 12300 |

Non-active/fluoride-free markers: nano-hydroxyapatite, calcium carbonate, sodium bicarbonate, xylitol — all map to `default_ppm: 0, classification: Fluoride-Free`.

## 5. Subcategory detection

| Subcategory | Keyword signals |
|---|---|
| toothpaste_gel | toothpaste, dentifrice, gel, zahncreme, pasta de dientes |
| mouthwash_rinse | mouthwash, rinse, mondwater, collutorio |
| dietary_supplement | fluoride drops, fluoride tablets, chewable fluoride, "fluoride ion mg" dosage labeling |

Fallback: if no keyword matches, default to `toothpaste_gel` (the larger category) and cap confidence at Medium.

## 6. Category-specific threshold tables

### 6.1 Toothpaste / Gel

| Tier | PPM range | Verdict | Guidance |
|---|---|---|---|
| Low (Children's) | 250–500 | Low Fluoride Content | Formulated for young toddlers to reduce fluorosis risk if swallowed |
| Standard (Adult OTC) | 1000–1500 | Standard Fluoride Content | Typical daily adult cavity protection level |
| High (Prescription/Clinical) | 5000–25000 | High Fluoride Content — Prescription Strength | Dentist-prescribed or in-office use only |
| Fluoride-Free | 0 | Fluoride-Free | — |

### 6.2 Mouthwash / Rinse

| Tier | PPM range | Verdict | Guidance |
|---|---|---|---|
| Low | 0–99 | Low Fluoride Content | — |
| Standard (Daily Rinse) | 100–250 | Standard Fluoride Content | Typical daily anticavity rinse strength |
| High | 251–1000 | High Fluoride Content | — |
| Fluoride-Free | 0 | Fluoride-Free | — |

### 6.3 Dietary / Dental Supplements — read this before building

Supplement dosing is fundamentally different from topical products: the *correct* dose depends on the child's age **and** the fluoride level already in their local drinking water — something the ADA/AAPD schedule requires and the app has no way to know from a photo. Recommending a specific dose without that context would be practicing medicine, not reporting label content.

**What the app should do instead:**
- Detect the fluoride content per dose as printed on the label (e.g., "0.25 mg," "0.5 mg," "1.0 mg" per tablet/dropper).
- Report it as a plain fact: *"This supplement provides 0.5 mg fluoride per dose."*
- Classify only into a simple informational tier (Low/Standard/High per-dose amount), not a recommendation.
- Always attach a fixed disclaimer: *"Fluoride supplement dosing depends on your child's age and local water fluoride levels — consult a dentist or pediatrician before use."*

| Informational tier | Per-dose amount | Note |
|---|---|---|
| Low | 0.25 mg | — |
| Standard | 0.5 mg | — |
| High | 1.0 mg | — |

This is the one place in the whole project where the "likelihood, not proof" honesty constraint extends to "information, not a recommendation" — keep the app on the safe side of that line.

## 7. Confidence scoring (same formula shape as GMO and as your existing spec)

| Factor | Condition | Points |
|---|---|---|
| Ingredient list completeness | Full list OCR'd, no truncation | +2 |
| Product identification | Barcode/name matched Open Beauty Facts | +2 |
| Lookup match rate | ≥80% of ingredients recognized | +1 |
| Concentration clarity | Compound found WITH a nearby number, not just the name | +1 |

| Total | Confidence |
|---|---|
| 4–5 | High |
| 2–3 | Medium |
| 0–1 | Low |

Note: supplements tend to state dosage very explicitly (it's a regulated product), so confidence is often High once the compound is detected at all — the hard part for supplements is the guidance framing, not the detection.

## 8. Verdict / submission / admin schemas

Same shape as the fluoride oral-care schema already built, extended with:
- `subcategory` field now includes `dietary_supplement` as a third option
- Supplement verdicts always carry the fixed disclaimer field described in 6.3
- Target Audience / Usage Notes stays admin-curated only, never auto-generated — same rule as oral care

## 9. Pipeline (identical shape across all three subcategories)

1. OCR extracts text (product name/category cues from front, ingredients/dosage from back)
2. Normalize and tokenize
3. Detect subcategory (toothpaste_gel / mouthwash_rinse / dietary_supplement)
4. Match against the compound lookup table
5. Extract nearby numeric value (% or ppm or mg) if present
6. Convert to ppm via the compound's multiplier, or use default_ppm if no number found
7. Classify against the matching category's threshold table
8. Score confidence
9. Assemble verdict (with disclaimer attached, if supplement)

## 10. Build order

1. Toothpaste + mouthwash — fully spec'd, build and validate first
2. Confidence-tier UI, since this is your differentiation area
3. Supplements — add as a third subcategory once the core two are working, keeping the informational-only framing from section 6.3
4. Validate against real product samples: Open Beauty Facts bulk export for oral care; a small hand-collected set for supplements

## 11. Open questions

- Confirm actual shelf products available in your target market before finalizing subcategory keyword lists — the current list is English/EU-language, may need adjustment.
- Decide whether supplements make it into the 4-week build at all, or stay documented-but-unbuilt as a "here's how we'd extend it" section for judging purposes.
