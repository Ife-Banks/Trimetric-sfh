# GMO Lookup Dataset — QA Review & Cleanup

**Reviewed:** `gmo_lookup_data_set.xlsx` (301 rows) + `gmo_lookup data set explanation.docx`
**Verdict:** Conceptually correct and well-aligned with the spec. **Not dev-ready as delivered** — five mechanical issues, all fixed. Cleaned files attached.

---

## 1. The good news

The explanation doc is accurate. Whoever wrote it understood the design:

- Certifications short-circuit to Low/High and stop scoring — correct
- `Crop_Family` exists specifically to prevent double-counting corn starch + corn syrup as two crops — correct, and this is the subtle point most people miss
- Ambiguous derivatives lower confidence rather than raising likelihood — correct, and this is the single most important rule in the whole engine
- Low-risk tokens are ignored rather than omitted — correct, and more useful than leaving them out

The `Rules_Engine_Action` column is a genuinely good idea. Putting the instruction in the data row means a developer doesn't have to cross-reference a separate document to know what a match does.

**The team added real value beyond my v0.2 spec:** 203 unique tokens vs. my ~40. Real derivative names (`zein`, `soy leghemoglobin`, `sodium stearoyl lactylate`, `oleoresin paprika`, `crystalline fructose`) that only come from actually reading labels. That work is not something to redo.

---

## 2. Issues found

### ISSUE-1 · The file is two batches concatenated · **blocking**

301 rows contain only **203 unique tokens**. Rows ~1–160 and ~161–301 are two separately-built batches appended together, with 98 duplicated tokens.

83 duplicates are harmless (identical rows). 15 are not — same token, different classification.

**Impact if shipped as-is:** the engine's behaviour depends on whether it stops at the first match or the last. That's a coin-flip on 15 ingredients including `sugar` and `glucose syrup`, which appear on an enormous share of real products.

**Fixed:** deduplicated to 203 unique tokens.

### ISSUE-2 · Ambiguous rows carrying real crop families · **blocking, and the dangerous one**

Several rows are `Ambiguous Derivative` but carry a real crop family:

| Token | Match_Type | Crop_Family |
|---|---|---|
| maltodextrin | Ambiguous Derivative | **corn** |
| sugar | Ambiguous Derivative | **sugar_beet** |
| molasses | Ambiguous Derivative | **sugar_beet** |
| invert sugar | Ambiguous Derivative | **sugar_beet** |

**Why this is dangerous:** the spec says N = count of distinct crop families matched. If a developer implements that literally — collect `crop_family` from every matched row, count the distinct set — then scanning a product containing only `sugar` returns **N=1, Medium likelihood**, when the correct answer is **N=0, Low likelihood with reduced confidence.**

That inverts the core design rule. The whole reason ambiguous derivatives exist as a separate class is that they must never raise the likelihood score.

This is not a hypothetical bug — it's the most natural way to implement the spec from this data.

**Fixed:** every ambiguous row now has `crop_family: derivative`. The real crop moved to a new `Possible_Sources` column, so the information is preserved for display ("sugar may derive from sugar beet") without being structurally able to inflate N.

### ISSUE-3 · `glucose syrup` classified both ways · **blocking**

Row 106: `ambiguous_derivative / derivative`. Row 275: `explicit_crop / corn`.

**Resolved to ambiguous.** Glucose syrup is corn-derived in the US but wheat-derived across much of Europe and Asia — and the label rarely says which. Classifying it as an explicit corn match would assert something the label doesn't support, which breaks the "likelihood from visible evidence" constraint. Ambiguous is the honest call.

### ISSUE-4 · Two labels for one concept · **minor**

`Low Risk` (66 rows) and `Non-GMO / Low Risk` (10 rows) are the same class. One action string is also missing its closing parenthesis, so string-equality checks would treat the two as different actions.

**Fixed:** normalised to `low_risk` / `ignore`.

### ISSUE-5 · Column headers don't match column contents · **minor but confusing**

The header row reads `ID, Token_Ingredient, Crop_Family, Match_Type, Category, Rules_Engine_Action`, but the actual data has **Match_Type and Category swapped** — column D holds `Food` (the category) and column E holds `Explicit Crop` (the match type).

A developer mapping columns by header name gets the wrong field. Fixed in the cleaned file.

---

## 3. What the cleaned dataset looks like

| Match type | Rows |
|---|---|
| certification | 6 |
| explicit_crop | 84 |
| ambiguous_derivative | 47 |
| low_risk | 66 |
| **Total unique tokens** | **203** |

Explicit crop coverage: corn 31, soy 19, canola 7, cotton 5, apple 5, potato 5, alfalfa 3, papaya 3, zucchini 3, sugar_beet 2, eggplant 1.

**One gap worth noting:** sugar_beet has only 2 explicit tokens, because most beet-derived tokens (`sugar`, `molasses`, `invert sugar`) correctly moved to ambiguous. That's the right outcome, but it means beet sugar is effectively only detected when a label says "beet sugar" explicitly. Nothing to fix — just know that beet detection is weak by nature, not by error.

---

## 4. Two rules the data can't express — put these in the engine code

**The confidence penalty applies once per product, not once per match.** A product listing citric acid, natural flavors, xanthan gum, and lecithin has four ambiguous matches. Applying −1 four times drives confidence to Low on an otherwise perfectly readable label. The penalty means "this label contains untraceable ingredients," which is one fact about the product, not four.

**Low-risk tokens still count toward the recognised-token ratio.** They're ignored for *scoring*, but matching `salt` or `water` proves the OCR read that token correctly. The confidence factor "≥80% of ingredients recognised" should count low_risk matches as recognised — otherwise a clean scan of a simple product scores as though OCR failed.

---

## 5. Does this combine with the fluoride work?

Yes, cleanly — the structures are already parallel:

| | GMO | Fluoride |
|---|---|---|
| Lookup unit | token → match_type + crop_family | compound → ppm multiplier |
| Short-circuit | certification → Low/High | fluoride-free markers → 0 ppm |
| Scoring input | distinct crop count (N) | ppm value |
| Classification | N tiers (0/1/2+) | category threshold table |
| Confidence | points formula | points formula |
| Output | `EngineResult` | `EngineResult` |

Both fit the `EngineResult` contract in `01_TECHNICAL_SPECIFICATION.md` without modification. Both load from `lookup_config` as versioned JSON. No architecture change needed.

`gmo_lookup_config_v1.0.json` is keyed by token for O(1) lookup and ready to seed directly into the `lookup_config` table alongside the fluoride config.

---

## 6. Answer to "can we start dev with this?"

**Yes — using the cleaned files, not the originals.**

The concept work is sound and the token coverage is genuinely good. The problems were mechanical (a merge artifact, a column swap, one classification conflict) rather than conceptual, and they're fixed.

Before handing to the coding agent:
1. Use `gmo_lookup_config_v1.0.json` as the seed for `lookup_config`, not the raw xlsx
2. Have the data team sanity-check the 5 conflict resolutions in §2 and §3 — they're my calls, and the team may have context I don't
3. Add the two engine-level rules from §4 to the GMO engine's unit tests — both are easy to get wrong and invisible until a real product exposes them

Everything else in the existing build docs stands unchanged.
