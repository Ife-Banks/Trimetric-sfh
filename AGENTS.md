<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — SHF Final Resolve

This file contains high-signal, repo-specific guidance for agents. Read it before writing code.

## Local development constraints (verified)

- **Hosted Supabase only. Never run `supabase start` or any Docker-based local stack.** The project targets a hosted Supabase project; credentials live in `.env.local` (gitignored). Apply schema with `supabase db push` (needs a linked project + DB password) or the dashboard SQL editor — neither uses Docker. If a local container is ever left running, `supabase stop` cleans it up.
- **`npm run typecheck` needs Next's generated route types.** Next 16 emits global `LayoutProps` / `PageProps` types into `.next`. After deleting `.next`, run `npx next typegen` (or `next dev` / `next build`) before `tsc --noEmit`, or typecheck fails with `Cannot find name 'LayoutProps'`.
- **Keep `node_modules` / `.git` in `eslint.config.mjs` `globalIgnores`.** In this ESLint version `globalIgnores()` replaces the built-in ignores; omit them and `npm run lint` hangs scanning `node_modules`.
- **Stack is Next.js 16.3.5 + React 19.2.8 + Tailwind v4** (App Router, `src/` dir, `@/*` alias). Read `node_modules/next/dist/docs/` before writing framework code — App Router APIs differ from earlier majors.

## Build Order (Phases 1–7, sequential)

**Phase 1 — Foundation**: Next.js + TS + Tailwind → Supabase project → apply migration from `04_BACKEND_STRUCTURE.md` verbatim → **enable RLS and verify with anon-key test script** (cannot read `submissions`, write `products`, write `lookup_config`) → seed `lookup_config` + 20–40 `products` rows

**Phase 2 — GMO engine**: `normalize.ts` → `gmoEngine.ts` per `GMO_Build_Guide.md` → **unit tests first** (certified organic, N=0, N=1, N=2+, ambiguous-only, truncated text)

**Phase 3 — Capture + OCR**: CameraView with getUserMedia, front/back capture, file-upload fallback → Tesseract.js in Web Worker, lazy-loaded → downscale images to ~1600px long edge → pass `meanConfidence` through to engine

**Phase 4 — Verdict + submission**: `VerdictScreen` rendering `EngineResult` → `ConfidenceBadge` visually distinct from `ResultBadge` (separate shapes, not just colours) → low-confidence → `SubmissionForm` pre-filled from engine output → Canvas re-encode before upload → POST to `/api/submissions` (Zod validation, rate limiting)

**Phase 5 — Admin review**: `/admin` with server-side auth + role check in layout → paginated pending queue filterable by category → expand row → photo via signed URL + live recompute preview from corrected text → Approve calls `approve_submission()` (admin approves computed verdict, never hand-typed)

**Phase 6 — Fluoride engine**: `fluorideEngine.ts` per `Fluoride_Build_Guide.md`, reuses entire pipeline/schema/UI, only engine module + threshold tables are new

**Phase 7 — Hardening**: Work through pre-launch checklist in `05_SECURITY_ASSESSMENT.md`.

## Non-negotiable constraints (from `06_AGENT_CONTEXT.md` §2)

1. **Result and Confidence are two separate badges.** Never merge into a single score. "Low GMO likelihood, High confidence" and "Low GMO likelihood, Low confidence" must look clearly different.
2. **Never claim proof.** Every GMO verdict renders a constraint notice stating a photo cannot confirm GMO content. Not dismissible.
3. **No medical advice.** Report what the label says and what the standard tier means. Never recommend dosage.
4. **Rules engines are deterministic.** Regex + arithmetic only. No LLM in the verdict path. No `eval()` / `new Function()` — lookup configs are data, regex strings go to `new RegExp()`.
5. **Only admins write to `products`.** Anonymous users may propose into `submissions` only. Enforced by RLS at the database layer, not by UI.
6. **Never `dangerouslySetInnerHTML`** with user-derived content.

## Architecture (from `02_SYSTEM_ARCHITECTURE.md`)

- **Single pipeline**: capture → OCR → category router → engine → EngineResult → verdict UI. GMO and fluoride never run on the same product.
- **Three product-identification tiers, always in this order**:
  1. **Barcode match** — decodable barcode exact-match against `products.barcode` → stored verdict, confidence: High. Skip OCR + rules engine entirely.
  2. **Name match (fuzzy)** — no barcode or no match → OCR front-label text → fuzzy trigram match against `products.name` (threshold ~0.6) → stored verdict: high if strong match, medium if borderline. Still extracts ingredients text in parallel.
  3. **Ingredients-only** — no identity match → run OCR'd ingredients through the rules engine from cold start. This is the common path for local/unbranded products.
- **Category routing**: classify from barcode metadata or front-label keywords. If ambiguous, prompt the user. Never guess, never run both engines.
- **Engines are pure functions** in `src/engines/` — **no React imports, no Supabase clients**. Unit-testable in isolation. Both satisfy the `Engine` signature: `(ingredientsText: string, ctx: EngineContext) => EngineResult`.
- **EngineResult shape** is shared — `VerdictScreen` renders any `EngineResult` regardless of origin. Adding a third category requires zero changes to the screen.
- **Category routing** is deterministic: one engine per product. Never run both.

## OCR (from `03_FRONTEND_ARCHITECTURE.md` §5, `06_AGENT_CONTEXT.md` §7)

- Tesseract.js **must run in a Web Worker**. On the main thread it blocks the UI for seconds and the app appears frozen.
- Lazy-load language data — not in the initial bundle.
- Expose: `recognize(image) → { text, meanConfidence, blocks }`.
- Surface real progress to the user — a processing state with no feedback for 6s reads as a crash.
- `meanConfidence` feeds the engines' confidence scoring — pass it through, don't discard it.
- Run engine matching inside the Web Worker. Add a timeout guard — abort and return low confidence rather than hanging on a pathological pattern.

## Lookup config (from `02_SYSTEM_ARCHITECTURE.md` §5, `04_BACKEND_STRUCTURE.md` §2.4)

- Fetch published `lookup_config` per category on launch, cache in IndexedDB with version tag.
- Engines read from cache. Every `EngineResult` records `configVersion`.
- If network unavailable, cached config is used. If no cache and no network, app can capture but cannot score.
- Data team can correct lookup tables without an app redeploy.

## Database / RLS (from `04_BACKEND_STRUCTURE.md`)

- **Enable RLS on every table**. No exceptions. A table without RLS is readable/writable by anyone with the anon key.
- Run `create extension if not exists pg_trgm;` before creating `products`.
- Admin role lives in `profiles` table (not `auth.users.raw_user_meta_data`). All admin checks call the `is_admin()` SECURITY DEFINER function.
- Service role key: stored as `SUPABASE_SERVICE_ROLE_KEY`, **never** with a `NEXT_PUBLIC_` prefix. Instantiated only inside `lib/supabase/server.ts` which starts with `import 'server-only'`.
- CI check: greps production build output for the service role key value and fails the build on a match.

## Submission flow (from `02_SYSTEM_ARCHITECTURE.md` §4.3, `04_BACKEND_STRUCTURE.md` §2.3)

- Low confidence → render verdict with submission CTA → user corrects pre-filled fields → upload image to Supabase Storage `submission-images` bucket (private, max 5MB, JPEG/PNG only, client-side Canvas re-encode strips EXIF) → POST to `/api/submissions` → INSERT into `submissions` with status `pending`.
- Rate limit: per-IP (e.g. 5 submissions/hour) + coarse client fingerprint as secondary key.
- Cap total pending submissions per IP; reject new ones beyond the cap.
- Admin reviews pending queue → expand row → photo via signed URL (short TTL) + live recompute preview from corrected text → Approve calls `approve_submission()` function → INSERT into `products` + UPDATE submissions.status to `approved`.

## Security prerequisites (from `05_SECURITY_ASSESSMENT.md`)

Before any public access, verify these:

- [ ] RLS enabled and verified on every table via anon-key test script
- [ ] Service role key absent from production build output (CI-checked)
- [ ] Admin role stored in `profiles`, not user metadata; MFA enabled on all admin accounts
- [ ] Storage bucket private; signed URLs only; SVG rejected; magic-byte validation server-side
- [ ] Rate limiting live on submission endpoint
- [ ] Zod validation on every server-accepted payload
- [ ] Security headers including CSP deployed and verified (in `next.config.js`)
- [ ] No `eval()` / `new Function()` anywhere (grep the codebase)
- [ ] No `dangerouslySetInnerHTML` with user-derived content anywhere (grep)
- [ ] EXIF stripping confirmed on a real photo with GPS data
- [ ] `npm audit` clean at high severity
- [ ] Staging uses a separate Supabase project from production

## Key directories (from `03_FRONTEND_ARCHITECTURE.md`)

- `src/app/` — routes (App Router)
- `src/components/` — capture, verdict, submission, admin UI components
- `src/engines/` — `gmoEngine.ts`, `fluorideEngine.ts`, `types.ts`, `normalize.ts`, `router.ts` — **no React imports**
- `src/lib/supabase/` — browser client (anon key) + server client (route handlers / admin)
- `src/lib/ocr/` — tesseract.ts, barcode.ts
- `src/lib/config/` — lookupConfig.ts (fetch + IndexedDB cache)
- `src/lib/validation/` — schemas.ts (Zod, shared client+server)

## Definition of Done (MVP)

- [ ] Scan a packaged food product → GMO verdict with a separate confidence badge
- [ ] Low-confidence scan → pre-filled submission form → row in `submissions`
- [ ] Admin approves → row in `products` with full provenance
- [ ] Re-scanning that product → High-confidence stored verdict via barcode, or strong name match when no barcode exists
- [ ] Same flow works for an oral-care product through `fluorideEngine`
- [ ] Constraint notice visible on every GMO verdict
- [ ] Anon-key test script passes; security checklist items 1–3 complete