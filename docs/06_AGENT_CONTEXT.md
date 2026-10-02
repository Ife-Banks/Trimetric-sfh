# Coding Agent Context — SHF Final Resolve

**Read this first. It is the single source of truth for what you are building and the constraints you must not violate.**

---

## 1. What this product is

A mobile-first PWA where a user photographs a product's front and back label. The app reads the label with OCR, matches the ingredients against a lookup table, and returns a plain-language verdict:

- **Food products** → GMO likelihood (Low / Medium / High)
- **Oral care products** → fluoride content (Fluoride-Free / Low / Standard / High)

Every verdict carries a **separate confidence rating**. When confidence is low, the user is invited to submit a correction, which enters an admin review queue and — once approved by a human — becomes part of the verified dataset.

---

## 2. Non-negotiable constraints

Violating any of these breaks the product's core premise. Do not "improve" past them.

| # | Constraint |
|---|---|
| 1 | **Result and Confidence are two separate values, displayed as two separate badges.** Never merge them into a single score. A "Low GMO likelihood, High confidence" and a "Low GMO likelihood, Low confidence" must look clearly different to the user. |
| 2 | **Never claim proof.** A photo cannot confirm GMO content. Every GMO verdict renders a constraint notice stating this. It is not dismissible. |
| 3 | **No medical advice.** Report what the label says and what the standard tier means. Never recommend dosage, never tell a user what to take. |
| 4 | **Rules engines are deterministic.** Regex matching and arithmetic only. No LLM in the verdict path. An LLM may be used for text extraction if OCR proves inadequate, but never for judgment. |
| 5 | **Only admins write to `products`.** Anonymous users may propose into `submissions` only. Enforced by RLS at the database layer, not by UI. |
| 6 | **Never `eval()` or `new Function()`.** Lookup configs are data. Regex strings go to `new RegExp()`. |
| 7 | **Never `dangerouslySetInnerHTML`** with user-derived content. |

---

## 3. Stack

```
Next.js (App Router) + TypeScript + Tailwind CSS
Supabase (Postgres, Auth, Storage, RLS)
Tesseract.js (client-side OCR, runs in a Web Worker)
Zod (validation, shared client + server)
Vercel (hosting)
```

Delivery is a **PWA**, not a native app. Camera access via `getUserMedia`. HTTPS required.

---

## 4. Companion documents

| Document | What it contains |
|---|---|
| `01_TECHNICAL_SPECIFICATION.md` | Functional requirements, the `EngineResult` contract, definition of done |
| `02_SYSTEM_ARCHITECTURE.md` | Layer map, request flows, trust boundaries, config flow |
| `03_FRONTEND_ARCHITECTURE.md` | Route structure, directory layout, component responsibilities |
| `04_BACKEND_STRUCTURE.md` | Full SQL schema, RLS policies, `approve_submission()` function, storage policies |
| `05_SECURITY_ASSESSMENT.md` | 15 findings with remediations, pre-launch checklist |
| `GMO_Build_Guide.md` | GMO lookup tables and scoring rules |
| `Fluoride_Build_Guide.md` | Fluoride lookup tables, ppm conversion, threshold tables |

The SQL in `04` and the scoring rules in the two build guides are **implementation-ready** — use them as written rather than reinventing.

---

## 5. The central abstraction

Everything in the UI layer is shared between categories. Only the engines differ.

```typescript
// src/engines/types.ts
type Tier = 'low' | 'medium' | 'high';

interface EngineResult {
  category: 'gmo_food' | 'oral_care';
  subcategory: string;
  result:     { tier: Tier | 'none'; label: string };
  confidence: { tier: Tier; score: number; factors: string[] };
  matchedTerms: Array<{
    term: string;
    normalized: string;
    kind: 'explicit' | 'ambiguous' | 'certification' | 'active_compound';
    detail?: string;
  }>;
  guidance: string;
  constraintNotice: string;
  computedAt: string;
  configVersion: string;
}

interface EngineContext {
  ocrMeanConfidence: number;        // 0–1, from Tesseract per-block confidence
  isTruncated: boolean;             // OCR pipeline flagged the list as cut off — never inferred from text content
  identityMatch: 'barcode' | 'name' | 'none';
  category: 'gmo_food' | 'oral_care';
  subcategory: string;
}

type Engine = (ingredientsText: string, ctx: EngineContext) => EngineResult;
```

`gmoEngine` and `fluorideEngine` both satisfy `Engine`. `VerdictScreen` accepts an `EngineResult` and does not know which engine produced it.

**Rule: nothing in `src/engines/` may import React or any Supabase client.** Pure functions over `(ingredientsText, ctx)`, unit-testable in isolation — which means tests import the real function directly. Never mock the engine under test; that tests the mock instead of the code.

---

## 6. Build order

Follow this sequence. Do not start a phase before the previous one works end to end.

### Phase 1 — Foundation
1. Scaffold Next.js + TypeScript + Tailwind
2. Supabase project; apply the migration from `04_BACKEND_STRUCTURE.md` verbatim
3. **Enable RLS and verify with an anon-key test script before writing any feature code.** Script must confirm: cannot read `submissions`, cannot write `products`, cannot write `lookup_config`
4. Seed `lookup_config` with the GMO and fluoride config JSON; seed 20–40 `products` rows

### Phase 2 — GMO engine (primary category)
1. `normalize.ts` — lowercase, strip punctuation, split on commas, trim
2. `gmoEngine.ts` per `GMO_Build_Guide.md`: certification short-circuit → explicit crop matching → distinct-family count (N) → ambiguous derivative detection → confidence points
3. **Unit tests first.** Fixture ingredient strings covering: certified organic, N=0, N=1, N=2+, ambiguous-only, truncated text. These are the highest-value tests in the project
4. No UI yet — engine correct in isolation before it's wired to anything

### Phase 3 — Capture and OCR
1. `CameraView` with `getUserMedia`, front then back capture, file-upload fallback
2. Tesseract.js in a Web Worker, lazy-loaded, with real progress feedback
3. Downscale images to ~1600px long edge before recognition
4. Pass `meanConfidence` through to the engine — do not discard it

### Phase 4 — Verdict and submission
1. `VerdictScreen` rendering an `EngineResult`
2. `ConfidenceBadge` visually distinct from `ResultBadge` — this is the product's differentiator, give it real design attention
3. Low-confidence → `SubmissionForm`, every field pre-filled from what the engine extracted
4. Client-side Canvas re-encode before upload (strips EXIF, normalises format)
5. POST to `/api/submissions` — Zod validation, rate limiting, insert

### Phase 5 — Admin review
1. `/admin` with server-side auth + role check in the layout
2. Paginated pending queue, filterable by category
3. Expand row → photo via signed URL + live recompute preview from corrected text
4. Approve calls `approve_submission()` — admin approves a computed verdict, never hand-typed values

### Phase 6 — Fluoride engine
1. `fluorideEngine.ts` per `Fluoride_Build_Guide.md`
2. Should be fast: reuses the entire pipeline, schema, and UI. Only the engine module and threshold tables are new
3. If this phase requires changes to `VerdictScreen`, the abstraction in §5 was built wrong — fix the abstraction, not the screen

### Phase 7 — Hardening
Work through the pre-launch checklist in `05_SECURITY_ASSESSMENT.md`.

---

## 7. Implementation notes

**Config loading.** Fetch published `lookup_config` per category on launch, cache in IndexedDB, engines read from cache. Every `EngineResult` records `configVersion`. Never hardcode lookup tables in source.

**OCR must be off the main thread.** Tesseract.js on the main thread freezes the UI for seconds and reads as a crash.

**Regex safety.** Run engine matching inside the worker. Add a timeout guard — abort and return low confidence rather than hanging on a pathological pattern.

**Product identification — name and ingredients only.** OCR both the front label and ingredients panel on every scan. Fuzzy-match the OCR'd product name against `products.name` within the selected category (threshold 0.4; strong match ≥0.8). Strong name matches use the stored verdict while preserving stored confidence; borderline matches use the stored verdict with confidence capped at Medium. With no name match, run the deterministic engine over the OCR'd ingredients. Barcode scanning is not part of the active scan flow; legacy barcode columns may remain in the database for compatibility.

**Category routing.** Use the selected scan category and scope catalogue name search to it. Never cross-match categories and never run both engines.

**Images persist only on submission.** Do not upload every scan.

---

## 8. Definition of done

- [x] Scan a packaged food product → GMO verdict with a separate confidence badge
- [x] Low-confidence scan → pre-filled submission form → row in `submissions`
- [x] Admin approves → row in `products` with full provenance
- [x] Re-scanning that product → stored verdict via a strong product-name match, or ingredient-engine screening when unmatched
- [x] Same flow works for an oral-care product through `fluorideEngine`
- [x] Constraint notice visible on every verdict (including the no-match screen)
- [x] Service-role key handling correct; CI greps build output for it
- [x] Component tests guard the two-badge constraint across all 9 tier
      combinations (`verdict/badges.test.tsx`)
- [x] Scan-pipeline integration tests over realistic OCR text, both categories
- [ ] One end-to-end test: scan → low confidence → submit → appears in queue
- [ ] `npm run test:rls` recorded as passing against the hosted project — the
      script exists and is thorough, but it is still run by hand. It is not in
      CI because it needs live credentials.
- [ ] MFA enabled on all admin accounts (`ADMIN_MFA_REQUIRED=true` in the
      deployment env). The code checks the session's assurance level and fails
      closed, but the flag is off until TOTP is enrolled.

---

## 9. When you are unsure

- **Scoring rules** → the two build guides are authoritative
- **Schema or RLS** → `04_BACKEND_STRUCTURE.md` is authoritative, use the SQL as written
- **Visual design** → the Figma file is authoritative; `03_FRONTEND_ARCHITECTURE.md` covers structure only
- **A constraint in §2 seems to block a nicer implementation** → the constraint wins. Flag it rather than working around it
