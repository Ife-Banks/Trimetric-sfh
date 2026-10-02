# Technical Specification — SHF Final Resolve

**Product:** Mobile-first product label scanner returning GMO likelihood and fluoride content verdicts
**Stack:** Next.js (App Router) + Supabase + Tesseract.js
**Timeline:** 4 weeks
**Status:** Pre-development specification

---

## 1. Scope

### In scope (MVP)

| Capability | Category | Priority |
|---|---|---|
| Capture front + back product photos | Shared | P0 |
| OCR text extraction | Shared | P0 |
| GMO likelihood scoring | Food | P0 — primary MVP category |
| Fluoride content scoring | Oral care (toothpaste, mouthwash) | P1 |
| Verdict screen with result + confidence | Shared | P0 |
| Low-confidence submission flow | Shared | P0 |
| Admin review queue (approve/reject) | Shared | P0 |
| Barcode lookup fast-path | Shared | P1 |

### Out of scope (documented, not built)

- Fluoride supplements (informational tier only — see Fluoride Build Guide §6.3)
- Plant health diagnosis (third category in the original brief)
- Water, salt, milk fluoride categories
- User accounts beyond anonymous scanning + optional submission identity
- Push notifications, submission status tracking for users

---

## 2. Core product constraints

These are non-negotiable and must be visible in the built product:

1. **Likelihood, not proof.** A photo cannot confirm GMO content. Every GMO verdict carries this statement.
2. **Two independent axes.** Result (Low/Medium/High) and Confidence (Low/Medium/High) are separate badges, never merged into a single score.
3. **Information, not medical advice.** No dosing recommendations, no health directives. Fluoride verdicts report what the label says and what the standard tier means.
4. **Human-vetted data.** Nothing enters the verified dataset without admin approval.

---

## 3. Functional requirements

### FR-1: Capture
- User captures or uploads a front image and a back image.
- Front is used for product name, brand, category cues, and certification marks.
- Back is used for the ingredients list.
- Both images are held in memory client-side; only submitted images are persisted.

### FR-2: Product identification — name and ingredients

The scan always OCRs the package front and ingredients panel. The product name is fuzzy-matched against `products.name` within the selected category (trigram similarity). Barcode scanning is not part of the active flow.

- Similarity ≥ 0.8: use the stored product verdict and preserve its confidence tier.
- Similarity 0.4–0.79: use the stored product verdict but cap confidence at Medium.
- No name match: run the deterministic category engine on the OCR'd ingredients text.

The ingredients text is extracted for every scan, including name matches.

### FR-3: OCR extraction
- Runs client-side via Tesseract.js.
- Produces raw text plus a per-block confidence score.
- If mean OCR confidence < 0.6, this feeds the confidence scoring as a penalty.

### FR-4: Category routing
- Use the user-selected `gmo_food` or `oral_care` scan category; name search is scoped to that category.
- If neither classifies, prompt the user to pick a category rather than guessing.
- Route to exactly one engine. Never run both.

### FR-5: Rules engines
- `gmoEngine(ingredientsText, context) → EngineResult`
- `fluorideEngine(ingredientsText, context) → EngineResult`
- Both pure functions. No network calls, no side effects, no UI dependencies.
- Both return the identical `EngineResult` shape (see §5).

### FR-6: Verdict rendering
- Shared component renders any `EngineResult` regardless of origin — whether freshly computed by an engine or read from a name-matched stored product row.
- Displays: product identity, result badge, confidence badge, matched terms, guidance text, constraint statement.

### FR-7: Submission flow
- Triggered when `confidence === 'low'` or no engine match was possible.
- Pre-fills every field the engine did manage to extract.
- Persists the captured image to Supabase Storage at this point (and only at this point).

### FR-8: Admin review
- Authenticated admin-only route.
- Table of pending submissions, filterable by category.
- Each row expands to show submitted data plus a live recomputation preview from the corrected ingredients text.
- Approve writes to `products`; reject updates status only.

---

## 4. Non-functional requirements

| Requirement | Target |
|---|---|
| Scan-to-verdict time (OCR path) | < 8s on a mid-range Android device |
| Offline capability | Capture + OCR + scoring work offline once `lookup_config` is cached; catalogue name lookup and submission require network |
| Bundle size | Tesseract.js language data lazy-loaded, not in the initial bundle |
| Accessibility | Result and confidence must not rely on colour alone — always paired with text labels |
| Browser support | Chrome/Safari on mobile, last 2 versions |

---

## 5. Shared data contract

Every engine returns this shape. This contract is the seam that lets both categories share the entire UI layer.

```typescript
type Tier = 'low' | 'medium' | 'high';

interface EngineResult {
  category: 'gmo_food' | 'oral_care';
  subcategory: string;              // 'toothpaste_gel' | 'mouthwash_rinse' | 'packaged_food'
  result: {
    tier: Tier | 'none';            // 'none' = fluoride-free / no GMO crops found
    label: string;                  // 'High GMO Likelihood' | 'Standard Fluoride Content'
  };
  confidence: {
    tier: Tier;
    score: number;                  // raw points, for debugging and admin preview
    factors: string[];              // human-readable reasons, shown in admin review
  };
  matchedTerms: Array<{
    term: string;                   // as found in the text
    normalized: string;             // canonical lookup entry
    kind: 'explicit' | 'ambiguous' | 'certification' | 'active_compound';
    detail?: string;                // e.g. '0.243%' or 'corn'
  }>;
  guidance: string;                 // plain-language "why it matters"
  constraintNotice: string;         // the honesty statement, always populated
  computedAt: string;               // ISO timestamp
  configVersion: string;            // which lookup_config version produced this
}
```

### 5.1 Engine input contract

Both engines take the same two arguments. `EngineContext` carries everything the engine needs that isn't in the raw ingredients text itself — OCR quality signals and whatever identity resolution already happened in FR-2, so the engine never has to re-derive this from string content (e.g. guessing truncation from a "…" character, which is fragile and won't reflect real OCR metadata).

```typescript
interface EngineContext {
  ocrMeanConfidence: number;        // 0–1, from Tesseract's per-block confidence (FR-3)
  isTruncated: boolean;             // OCR pipeline flagged the ingredients list as cut off
  identityMatch: 'barcode' | 'name' | 'none';  // barcode is retained only for legacy stored scan data
  identitySimilarity?: number;                  // fuzzy name similarity, 0–1
  category: 'gmo_food' | 'oral_care';
  subcategory: string;              // from FR-4 category routing
}

type Engine = (ingredientsText: string, ctx: EngineContext) => EngineResult;
```

`gmoEngine` and `fluorideEngine` both implement `Engine`. Neither may import React or a Supabase client (see `06_AGENT_CONTEXT.md` §5) — pure functions over `(ingredientsText, ctx)`, which is what makes them independently unit-testable without mocking themselves.

`configVersion` matters: when a lookup table changes, stored verdicts computed under an older version can be identified and recomputed.

---

## 6. Engine specifications

Full rules, lookup tables, and scoring formulas live in the two build guides:

- **GMO:** `GMO_Build_Guide.md` — certification short-circuit, explicit crop matches, ambiguous derivatives, distinct-family counting (N), confidence points
- **Fluoride:** `Fluoride_Build_Guide.md` — compound lookup, ppm conversion via multiplier, category threshold tables, confidence points

Both are loaded at runtime from `lookup_config`, not hardcoded.

---

## 7. Key technical decisions

| Decision | Choice | Rationale |
|---|---|---|
| App delivery | PWA via Next.js | One codebase for scan UI and admin panel; no app store review time in a 4-week window |
| OCR | Tesseract.js client-side | Free, offline-capable, no per-scan cost. ML Kit unavailable outside native Android |
| Rules engine location | Client-side TypeScript | Pure string matching + arithmetic; server round-trip adds latency for no benefit |
| Lookup tables | Runtime fetch from `lookup_config`, cached | Data team can correct tables without an app redeploy |
| Database | Supabase Postgres | Relational fit for lookup tables, submissions, and audit trail; auth and storage in one service |
| Image persistence | Only on submission | Storing every scan image is pure cost with no product benefit |

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Tesseract.js accuracy on real curved/glossy packaging | High — core flow degrades | Test against real photos in week 1. Fallback: server-side Vision API route behind a feature flag |
| Open Food Facts / Open Beauty Facts coverage gaps for local products | High — "no data" becomes the default experience | Seed `products` with hand-curated local products before demo; treat submission flow as a primary path, not a fallback |
| Category misclassification routing to the wrong engine | Medium — nonsense verdicts | Prompt the user on ambiguity rather than guessing |
| 4-week scope creep | High | GMO end-to-end first; fluoride only once GMO is complete |

---

## 9. Definition of done (MVP)

- [ ] A user can scan a packaged food product and receive a GMO likelihood verdict with a confidence badge
- [ ] A low-confidence scan routes to a pre-filled submission form
- [ ] A submitted item appears in the admin queue and can be approved into `products`
- [ ] An approved product returns a High-confidence verdict on subsequent scans
- [ ] The same flow works for an oral-care product via the fluoride engine
- [ ] The honesty constraint is visible on every GMO verdict screen
