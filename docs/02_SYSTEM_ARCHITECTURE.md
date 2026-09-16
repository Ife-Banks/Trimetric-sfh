# System Architecture — SHF Final Resolve

---

## 1. Architectural principle

**One pipeline, two pluggable engines.**

GMO and fluoride never run on the same product. The architecture is a single capture → OCR → route → score → render pipeline, where the only category-specific parts are the two engine modules and their lookup tables. Everything else — capture, OCR, verdict UI, submission, admin review, database schema — is shared.

If you find yourself writing a second verdict screen or a second submissions table, something has gone wrong.

---

## 2. Layer map

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT (Next.js PWA — browser)                             │
│                                                              │
│  Capture (getUserMedia) ──► OCR (Tesseract.js, WebWorker)   │
│           │                          │                       │
│           │                          ▼                       │
│           │              Normalize & Tokenize                │
│           │                          │                       │
│           │                          ▼                       │
│           │                  Category Router                 │
│           │                     │         │                  │
│           │              gmoEngine   fluorideEngine          │
│           │                     │         │                  │
│           │                     └────┬────┘                  │
│           │                          ▼                       │
│           │                    EngineResult                  │
│           │                          │                       │
│           │              ┌───────────┴──────────┐           │
│           │              ▼                      ▼           │
│           │        Verdict Screen      Submission Form      │
│           │                                     │           │
│  lookup_config (cached)                         │           │
└───────────┼─────────────────────────────────────┼───────────┘
            │                                     │
            ▼ (barcode lookup)                    ▼ (write)
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE                                                    │
│                                                              │
│  Postgres: products │ submissions │ lookup_config │ profiles │
│  Auth: anon users, admin role                                │
│  Storage: submission-images bucket                           │
│  RLS: enforced on every table                                │
└─────────────────────────────────────────────────────────────┘
            ▲
            │
┌───────────┴─────────────────────────────────────────────────┐
│  ADMIN (Next.js /admin — same deployment, auth-gated)        │
│  Review queue · live recompute preview · approve/reject      │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Why the engines run client-side

Both engines are pure functions over text: regex matching, set counting, and arithmetic. There is no model inference, no secret, and no privileged data involved.

Consequences of running them on the client:

- **No server round-trip** between OCR and verdict — the scan feels instant.
- **Offline capable** — once `lookup_config` is cached, a scan works with no network.
- **Zero per-scan server cost** — important for a project with no recurring budget.
- **Auditable** — the rules are inspectable, which reinforces the trust story.

The one thing the client must *not* do: decide what enters the verified dataset. Approval is server-side, admin-authenticated, RLS-enforced.

---

## 4. Request flows

The scan always captures a photo and always runs OCR on it — barcode and name matching are shortcuts to a *trusted stored answer*, tried before falling back to the rules engine, not alternatives to photographing the product.

### 4.1a Fastest path — known product (barcode)

```
User scans → barcode decoded → GET products WHERE barcode = ?
  → row found → render stored verdict (confidence: high)
```
No further OCR needed once the barcode resolves. Target < 2s.

### 4.1b Fast path — known product (name match, no usable barcode)

Most informally packaged and local-market products won't have a scannable barcode at all. This path is not a fallback edge case — expect it to be the common path for a significant share of real scans.

```
Capture front+back → OCR front → normalize product name
  → fuzzy match against products.name (trigram similarity)
  → similarity ≥ threshold → render stored verdict
      (confidence: high if strong match, medium if borderline)
  → below threshold → fall through to 4.2
```
Skips the rules engine but NOT the OCR step — the ingredients text is still extracted in parallel, so if the name match turns out too weak, nothing is re-captured.

### 4.2 Full path — no identity match

```
Capture front+back → OCR both → normalize
  → classify category → route to engine
  → EngineResult → render verdict
```
Target < 8s. Entirely client-side.

### 4.3 Low-confidence path

```
EngineResult.confidence.tier === 'low'
  → render verdict WITH submission CTA
  → user corrects pre-filled fields
  → upload image to Storage
  → INSERT INTO submissions (status: pending)
```

### 4.4 Admin approval path

```
Admin authenticates → SELECT submissions WHERE status = 'pending'
  → expand row → client recomputes EngineResult from corrected text
  → admin approves → INSERT INTO products + UPDATE submissions.status
```

The recompute preview is the important detail: the admin approves a *computed* verdict, not one they typed by hand. This keeps the verified dataset consistent with the rules engine.

---

## 5. Configuration flow

`lookup_config` holds the GMO and fluoride spec JSON as versioned rows.

```
App launch → GET lookup_config WHERE category IN (...) ORDER BY published_at DESC LIMIT 1 per category
  → cache in IndexedDB with version tag
  → engines read from cache
```

- If the network is unavailable, the cached config is used.
- If no cache exists and there is no network, the app can still capture and queue, but cannot score.
- Every `EngineResult` records `configVersion`, so verdicts are traceable to the ruleset that produced them.

This decoupling is what lets the data team fix a lookup table (a missing crop alias, a wrong ppm multiplier) without an app redeploy.

---

## 6. Trust boundaries

| Boundary | What crosses it | Control |
|---|---|---|
| Camera → app | Raw image | Never leaves the device unless the user submits |
| App → Supabase (read) | Barcode, config request | Public read on `products`/`lookup_config` via RLS |
| App → Supabase (write) | Submission row + image | Anon insert allowed into `submissions` only, rate-limited, never into `products` |
| Admin → Supabase | Approve/reject | Authenticated, role-checked, RLS-enforced, server-side |
| `lookup_config` → engines | Rule definitions | Treated as **data**, never evaluated as code (see Security doc) |

The critical asymmetry: **anonymous users can propose, only admins can publish.** This is the entire data-quality model, and it must be enforced at the database layer, not just in the UI.

---

## 6a. Name-matching, specifically

OCR'd product names are noisy — "Golden Penny Semo|ina" from a curved or glare-hit label is normal, not an edge case. Exact string matching against `products.name` will fail constantly. Use Postgres trigram similarity instead:

```sql
select id, name, similarity(name, $1) as score
from products
where name % $1                 -- trigram index-accelerated pre-filter
order by score desc
limit 1;
```

Suggested threshold: `score >= 0.6` → treat as a match (confidence: high if `>= 0.8`, medium otherwise); below 0.6 → no match, fall through to the full rules-engine path (4.2). Tune this threshold against real OCR output early — it's a one-line constant, but getting it wrong either floods the review queue with things that should have matched, or silently returns wrong products for things that shouldn't have.

---

## 7. Environments

| Environment | Frontend | Database |
|---|---|---|
| Local | `next dev` | Supabase local (Docker) or a dev project |
| Staging | Vercel preview deployment | Separate Supabase project — never shares the production database |
| Production | Vercel production | Production Supabase project |

Seed data for local/staging comes from a checked-in `seed.sql` containing the curated starter `products` rows and the current `lookup_config` versions.

---

## 8. Scaling notes (post-MVP, not build targets)

- `products` lookups are single-row barcode reads — a B-tree index on `barcode` carries this a long way.
- If OCR accuracy forces a server-side Vision fallback, put it behind a Next.js Route Handler with its own rate limit, not a direct client-to-vendor call (which would expose the API key).
- Submission volume is the growth axis that matters. If review becomes a bottleneck, the fix is reviewer tooling (bulk approve for identical products), not architecture change.
