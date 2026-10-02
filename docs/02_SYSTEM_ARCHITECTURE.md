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
            ▼ (name lookup)                     ▼ (write)
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE                                                    │
│                                                              │
│  Postgres: products │ submissions │ lookup_config │ profiles │
│  Auth: anon users, three-role (user/admin/superadmin)         │
│  Storage: submission-images bucket (private, signed URLs)    │
│  RLS: on every table; anon INSERT into submissions constrained │
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

The scan captures the package front and ingredients panel and always OCRs both. Product identification uses the OCR'd name within the selected category; the ingredients OCR always feeds the GMO or fluoride rules engine when no catalogue record matches. Barcode scanning is not part of the active scan flow.

### 4.1 Known product (name match)

```
Capture front+back → OCR both → fuzzy match front name in selected category
  → similarity ≥ 0.8 → render stored verdict; preserve stored confidence
  → similarity 0.4–0.79 → render stored verdict, cap confidence at Medium
  → no matching product → run category rules engine on ingredients OCR
```
### 4.2 Full path — no name match

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

Thresholds — single-source constants in `src/engines/constants.ts`
(`NAME_MATCH_THRESHOLD = 0.4`, `NAME_MATCH_STRONG = 0.8`), passed to the RPC
rather than hardcoded at call sites:

| Score | Behaviour |
|---|---|
| `>= 0.8` | Match. Stored verdict used, confidence tier preserved. |
| `0.4`–`0.79` | Match. Stored verdict used, confidence capped at Medium. |
| `< 0.4` | No match. Fall through to the full rules-engine path (§4.2). |

The RPC is category-scoped (`search_products_by_name(p_name, p_category, p_threshold)`) so an oral-care product can never fuzzy-match a `gmo_food` row.

#### A similarity score alone cannot tell "same product" from "same category"

`word_similarity` matches on **any shared word**, so a score in the accept band
does not mean the row is the same product. Measured against the live catalogue:

| OCR'd front-panel line | Best RPC row | Score | Same product? |
|---|---|---|---|
| `Toothpaste 50ml` | GUM Dental Paste Toothpaste | 0.688 | **no** — generic word + a number |
| `Whitening Anticavity Paste` | ACT Restoring Anticavity Fluoride **Mouthwash** | 0.481 | **no** — different product type |

Both sit inside the `0.4`–`0.79` accept band, and both returned the **wrong
product's stored fluoride verdict** to a scan of a brand that does not exist —
behind the green "Catalogue match by product name" framing.

So `identifyProduct` applies a second, stricter test before accepting a row: the
candidate and the product name must share at least one **distinctive** token —
lowercase alphanumeric, ≥3 chars, containing letters, and not in
`GENERIC_PRODUCT_WORDS` (`toothpaste`, `paste`, `mouthwash`, `rinse`, `gel`,
`cream`, `fluoride`, `whitening`, `sensitive`, `anticavity`, `care`, `daily`,
`plus`, … plus the food equivalents). `"Toothpaste 50ml"` shares nothing
distinctive and is rejected; `"COLGATE"` shares `colgate` and is kept.

**Accepted tradeoff:** a brand mangled enough by OCR to share no token at all
(`SENSODVNE` for `Sensodyne`) now falls through to the cold-start engine instead
of borrowing a stored verdict. That is the right direction to fail — an honest
engine screening beats a confident answer about a different product — but it does
mean a marginal name match is more likely to land on the provisional screen.

### Presenting a tentative match

A match below `NAME_MATCH_STRONG` is rendered as *"Tentative name match (0.69) —
confirm this is the same product"* in `--warning`, **without** the green
`BadgeCheck` icon. Only a strong name match (or a barcode hit, exact by
construction) gets the verified treatment. The stored product's name is always
shown next to the scanned photo so the two can be compared directly.

Tune these against real OCR output early — they are one-line constants, but
getting them wrong either floods the review queue with things that should have
matched, or silently returns wrong products for things that shouldn't have.

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

- `products` lookups use category-scoped trigram name matching.
- If OCR accuracy forces a server-side Vision fallback, put it behind a Next.js Route Handler with its own rate limit, not a direct client-to-vendor call (which would expose the API key).
- Submission volume is the growth axis that matters. If review becomes a bottleneck, the fix is reviewer tooling (bulk approve for identical products), not architecture change.
