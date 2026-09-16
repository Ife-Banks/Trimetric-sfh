# Combined Architecture & Tech Stack

This document is not a repeat of the GMO or Fluoride build guides — it's how those two rules engines sit inside **one app**, sharing infrastructure without duplicating logic.

## 1. The core insight: two engines, one router, not one engine doing two things

GMO and fluoride detection don't run on the same product at the same time — a bag of corn chips never needs a fluoride check, and a tube of toothpaste never needs a GMO check. So the "combination" isn't merging the two rulesets into one — it's building **one capture-and-scoring pipeline with a category router at the front**, which sends the ingredients text to the correct engine based on what kind of product was scanned.

This matters for how you build: keep `gmoEngine` and `fluorideEngine` as two completely separate, independently testable modules with the *same function signature* — each takes ingredients text and a category/subcategory, and returns the same shape of output (result, confidence, matched terms, guidance text). Everything else in the app — capture, OCR, verdict screen layout, submission form, admin review — is shared and doesn't care which engine produced the data.

## 2. Unified pipeline

1. Capture front + back photos
2. OCR extraction
3. **Category classification** — is this a food product or an oral-care/dental product? (Barcode category metadata if matched, or keyword detection on product name/category text as fallback)
4. Route to `gmoEngine` (food) or `fluorideEngine` (oral care) — never both
5. Each engine returns the same output shape: `{ result, confidence, matched_terms, guidance, subcategory }`
6. Shared verdict screen renders whatever came back, regardless of which engine produced it
7. If confidence is Low → shared submission form (with a `category` field so admin review knows which verified dataset it belongs to)
8. Shared admin review queue, filterable by category, approves into the correct verified table

## 3. Data model (Supabase / Postgres)

| Table | Purpose | Key fields |
|---|---|---|
| `products` | Verified lookup dataset, both categories | `id, barcode, name, brand, category (gmo_food \| oral_care), subcategory, ingredients_text, result, confidence_tier, matched_terms (jsonb), guidance_text, target_audience_notes (nullable, admin-only)` |
| `submissions` | Pending review queue, both categories | `id, category, subcategory, product_name, brand, ingredients_text, photo_url, matched_terms_guess, concentration_text, status (pending/approved/rejected), created_at` |
| `lookup_config` | Versioned JSON blobs — literally your GMO and Fluoride spec files | `id, category, version, config_json, published_at` — the client fetches the current version on launch/update, so tables can be corrected without an app redeploy |
| `admin_users` | Role-gated access to the review queue | Supabase Auth, role claim |

One `products` and one `submissions` table for both categories keeps the admin review UI simple — a single table with a category filter, not two separate admin screens to build and maintain.

## 4. Where each piece actually runs

- **Client-side (the mobile-first app):** OCR extraction, text normalization, category classification fallback, and *both rules engines*. These are pure functions over text — no reason to round-trip to a server for keyword matching and arithmetic. This also means the core scan flow can work offline once `lookup_config` is cached locally.
- **Server (Supabase / Next.js API routes):** barcode and fuzzy name lookup against `products` (needs the network — see the trigram-matching approach in `02_SYSTEM_ARCHITECTURE.md` §6a), writing submissions, and admin approve/reject actions.

## 5. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) | One codebase serves both the mobile-first scanning UI (`/scan`) and the admin review panel (`/admin`) — no need to build two separate frontends |
| Camera access | Browser `MediaDevices` API (`getUserMedia`) | Next.js is a web framework, so this ships as a mobile-first **PWA**, not a native app store build. **Decision point:** if the team wants a true native app (App Store/Play Store), that's a React Native or Flutter track instead, and it changes the OCR options below |
| OCR | Tesseract.js (client-side) | Since this is a web/PWA path, Google ML Kit (Android-native only) isn't an option. Tesseract.js runs in-browser, is free, and works offline once loaded — matches the brief's "free/on-device" preference. A cloud Vision API call from a Next.js API route is a fallback if Tesseract's accuracy is too low on real labels, at the cost of needing network + incurring API cost |
| Backend | Supabase (Postgres + Auth + Storage) | One project serves both categories via the shared schema in section 3 |
| Rules engines | Plain TypeScript modules (`gmoEngine.ts`, `fluorideEngine.ts`) | Same function signature, independently unit-testable, no UI dependency |
| Hosting | Vercel (Next.js) + Supabase managed cloud | Fast setup, matches the brief's "fast setup" guidance for backend |

## 6. Build sequencing across the 4 weeks

| Week | Focus |
|---|---|
| 1 | Capture + OCR pipeline, Supabase schema, GMO engine (primary MVP category per the brief) |
| 2 | GMO verdict screen, submission form, and admin review loop working end-to-end |
| 3 | Fluoride oral-care engine plugged into the same architecture — this should be fast, since it reuses the pipeline, schema, and UI shell; only the engine module and threshold tables are new |
| 4 | Confidence-tier UI polish (your innovation area), fluoride supplements as a stretch layer if time allows, validation testing against real product samples |

## 7. Shared vs. separate — the checklist for keeping this maintainable

| Shared | Separate |
|---|---|
| Capture UI, OCR extraction | Lookup tables / `lookup_config` per category |
| Submission form shell, admin review shell | Matching logic (`gmoEngine` vs `fluorideEngine`) |
| Confidence badge component, verdict screen layout | Threshold tables and guidance text |
| Supabase project, `products`/`submissions` schema | — |

## 8. Open technical decisions to lock before dev starts

1. **PWA vs. native app** — affects OCR tooling choice (Tesseract.js vs. ML Kit) and whether you need app store submission time in your 4-week schedule.
2. **Where `lookup_config` lives** — bundled into the app at build time (simpler, but requires a redeploy to fix a lookup table) vs. fetched at runtime from Supabase (more flexible, small added complexity).
3. **Admin auth model** — a single shared admin login is fine for a 4-week MVP; role-based Supabase Auth if more than one reviewer needs distinct access.
