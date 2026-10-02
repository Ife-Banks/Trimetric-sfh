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
- **Two product-identification tiers, always in this order**:
  1. **Name match (fuzzy)** — OCR the package front and ingredients panel, fuzzy-match the OCR'd name against `products.name` within the selected category (trigram similarity). Threshold **0.4**; strong match **≥ 0.8**.
     - Similarity ≥ 0.8: use the stored product verdict and preserve its confidence tier.
     - Similarity 0.4–0.79: use the stored product verdict but cap confidence at Medium.
     - No name match: run the deterministic category engine on the OCR'd ingredients text from a cold start. This is the common path for local/unbranded products.
     - **A score in the accept band is necessary but not sufficient.** `word_similarity`
       matches on any shared word, so `"Toothpaste 50ml"` scored 0.688 against
       `GUM Dental Paste Toothpaste` and `"Whitening Anticavity Paste"` scored 0.481
       against a *mouthwash* — both returning a stranger's stored fluoride verdict.
       `sharesDistinctiveWord` in `productIdentification.ts` is the second gate: the
       candidate and the name must share a token that is not a generic product word.
       **Never remove it, and never widen `GENERIC_PRODUCT_WORDS` without checking
       real catalogue names** — an accepted false match tells a user another
       product's fluoride level is theirs, which is worse than an honest miss.
     - A sub-0.8 match renders as *"Tentative name match"* in `--warning` with **no**
       green `BadgeCheck`. Do not give a tentative match the verified treatment.
  2. Barcode scanning is **not part of the active flow**. `products.barcode` and the `identityMatch: 'barcode'` value remain in the schema/types for legacy stored rows and dormant code (`src/lib/ocr/barcode.ts`, `@zxing/*`), but nothing calls them. Do not wire barcode back in without updating `01`/`02`/`06` together.
  - The ingredients text is extracted for **every** scan, including name matches.
  - **An unreadable front panel must never be reported as a catalogue miss.** The
    name match reads the FRONT panel only, so an unreadable front means the
    catalogue was never searched at all. `isFrontPanelReadable` gates this and
    `UnverifiedScreen` says *"We couldn't read the front label — this is about the
    photo, not the product."* Telling a user "we don't have this product yet" when
    the photo was simply unreadable sends them to re-check a database that may well
    contain it.
  - **OCR is defeated by photo TILT, not by resolution or quality.** Measured
    against the real Tesseract stack on one label: at −20° it returned **0
    characters**; at long edges of 1200, 1600, 2400 and 3200 it returned 0 every
    time; with the background removed it still returned 0. At **0°** it read 69
    characters at 0.9 confidence with the brand found. Grayscale and Otsu
    binarisation changed nothing and PSM 6/11 did not rescue the bad shot.
    **Tilt was the entire problem**, so `prepareBlobForOcr` in `lib/ocr/image.ts`
    measures it (`lib/ocr/deskew.ts`, horizontal projection profile) and rotates
    the label level before recognition. A real tilted-tube scan went from 29
    characters of noise at 0.30 confidence to `SENSODYNE PRONAMEL` at 0.94.
    - **Do not "improve" this by tuning preprocessing or page-segmentation
      modes.** All were measured and did nothing. If a scan still fails, the
      honest "couldn't read the front label" screen is the correct outcome.
    - `deskew.ts` returns the rotation that **levels** the text — the opposite
      sign to the tilt that produced the image. The caller applies it as-is. There
      is a test asserting exactly that sign relationship, because inverting it
      would rotate every tilted photo *further* out of alignment.
    - Search range is ±40°, step 1°, on a 400px grayscale buffer. A photo rotated
      by 90° (phone held sideways) is **not** covered — that would need the range
      doubled, at proportionally more work.
    - Deskew is **OCR-only** and deliberately not folded into `downscaleBlob`,
      which also produces the submission evidence photo. Rotating someone's photo
      before it is attached to a moderation decision is not a quiet transformation.
- **Category routing**: use the user-selected `gmo_food` or `oral_care` scan category; scope catalogue name search to that category. Never cross-match, never run both engines.
- **Engines are pure functions** in `src/engines/` — **no React imports, no Supabase imports**. `gmoEngine.ts` must not import from `src/lib/`; shared thresholds live in `src/engines/constants.ts` and tokenization in `src/engines/normalize.ts`.
- **EngineResult shape** is shared — the verdict UI renders any `EngineResult` regardless of origin. Adding a third category requires zero changes to the screen.
- **Engines are the single source of truth for displayed numbers.** The UI gauge reads `EngineResult.matchedTerms[].detail`; it must never re-parse the OCR text. A re-derived number can disagree with the tier beside it.
- **Engines must receive the FRONT-panel OCR text.** FR-1 assigns the front panel "product name, brand, category cues, and certification marks". `EngineContext.packageFrontText` carries it. Both engines search it alongside the ingredients text — `gmoEngine` for the certification short-circuit, `fluorideEngine` for compounds, ppm and fluoride-free claims. Restricting either engine to the back panel makes real packaging unreadable: seals and ppm figures are printed on the front and are not repeated in the ingredient list.
- **A single comma-delimited token can name several crops.** "SOYBEAN AND/OR CANOLA OIL" is two crop families. `classifyToken` collects every matching family; returning on the first alias match understates N and the likelihood tier.

## Testing (from `06_AGENT_CONTEXT.md` §6, `03_FRONTEND_ARCHITECTURE.md` §9)

- **`vitest.config.ts` must keep its `resolve.alias` for `@/*`.** Without it any module using the alias fails to collect and its whole test file silently reports 0 tests instead of an error. `include` must also cover `.tsx` (the badge constraint tests render components).
- Component tests declare `// @vitest-environment jsdom` per file; everything else stays on the fast node environment.
- **No engine under test may be mocked** — tests import the real function.
- `data/gmo_validation_set.json` (75 hand-labelled real products) is executed by `gmoEngine.validation.test.ts` and must stay at 100% token hit rate / 74-of-74.
- CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests, `npm run palette:check`, the lookup-config check, `npm audit --audit-level=high`, build, and greps build output for the service-role key. All must be green.
- **Colour changes need a rendered check, not just a passing build.** A literal
  hex *or* a Tailwind built-in (`bg-white`, `text-white`) silently opts an element
  out of dark mode, and Tailwind compiles both without complaint. Verify by
  loading the page and reading computed styles / contrast. `npm run palette:check`
  only catches hex values.
- **A contrast audit that walks leaf TEXT nodes cannot see icon-only controls.**
  The three OAuth buttons on `/login` were white-on-white at **1.0:1** in dark
  mode and a text-node audit reported them clean, because their label is an
  `aria-label` and the visible pixels are SVG. Audit every element that paints
  its own background and has visible content — text *or* icon.
- **`palette:check` bounds the utility on BOTH sides.** Tailwind's built-in
  palette (`bg-white`, `text-white`) is the same hazard as a raw hex and is not
  itself a hex. It occurs in three syntactic forms here — `bg-white`, the
  important form `!bg-white`, and the variant form `[&_button]:bg-white` — and
  each has broken dark mode at least once while the build stayed green. Any check
  or codemod for built-in colours must allow `!` and `:` before the utility, not
  just whitespace. `border-white` is intentional (a ring on a saturated fill).

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

- [x] Scan a packaged food product → GMO verdict with a separate confidence badge
- [x] Low-confidence scan → pre-filled submission form → row in `submissions`
- [x] Admin approves → row in `products` with full provenance
- [x] Re-scanning that product → stored verdict via name match, or engine screening when unmatched
- [x] Same flow works for an oral-care product through `fluorideEngine`
- [x] Constraint notice visible on every verdict (including the no-match screen)
- [x] Service-role key absent from build output, enforced in CI
- [x] Component tests guarding the two-badge constraint (3 result × 3 confidence tiers)
- [x] Scan-pipeline integration tests over realistic OCR text, both categories
- [x] Product palette tokenised; dark mode reaches every screen; contrast audited
- [x] `npm run test:rls` passing against the hosted project (6/6)
- [x] Phase 7 hardening migration applied + verified (8/8 checks)
- [ ] **E2E suite half-executed.** `e2e/contribution-loop.spec.ts` covers scan →
      verdict → correction form → submit → admin queue → approve → `products` →
      re-scan returns the stored verdict, as 6 serial steps so a failure names
      the broken link. Steps **1–2 pass against the real app** (verified:
      capture both panels, two separate badges, the OCR-quality finding, and a
      form pre-filled from engine output). Steps **3–6 are unrun** — they write
      to `products` and need a dedicated **test** Supabase project plus an admin
      account. Suspect the admin selectors first on the real run.
      Run: `npm run test:e2e:install`, then `E2E_ALLOW_WRITES=1 npm run test:e2e`
      with `NEXT_PUBLIC_SUPABASE_URL` pointing at the test project.
- [ ] MFA enrolled + `ADMIN_MFA_REQUIRED=true` (needs Dashboard TOTP config)
- [ ] A dedicated test Supabase project — `02_SYSTEM_ARCHITECTURE.md` §7 already
      requires staging be separate from production; the E2E suite is the concrete
      reason

## Working with this repo

- **Never run `supabase start` or any Docker stack.** Hosted Supabase only. Apply schema with `supabase db push` or the dashboard SQL editor.
- After deleting `.next`, run `npx next typegen` before `npm run typecheck`.
- `npm run test:all` runs typecheck + lint + unit tests. All three must be green.
- A new lookup table must bump `version` in the JSON, `seed.sql`, and the live
  `lookup_config` row together. `products.config_version` is what lets you find
  stored verdicts computed under the old rules and recompute them.
  Use `npm run publish:gmo` (generate + verify) and `npm run lookup:status`
  (read-only check of what the DB is serving).
- **SQL migrations must be idempotent.** Postgres has no `CREATE POLICY IF NOT
  EXISTS` and no `ADD CONSTRAINT IF NOT EXISTS` — drop the target name first, or
  a re-run dies with `42710 ... already exists`. Wrap multi-statement schema
  changes in an explicit `BEGIN`/`COMMIT`: without one, a failure partway leaves
  the security-relevant statements half applied, which is worse than not having
  run the file. End each migration with a verification `SELECT` so the operator
  sees what landed instead of assuming.
- **Only one published `lookup_config` row per category** (partial unique index
  `one_published_per_category`). Unpublishing the old version and publishing the
  new one must share a transaction — splitting them leaves a window with no
  ruleset, and scans in that window fail closed.

## Applying schema changes

Two different paths, depending on whether the change is a migration or a config
publish:

**Migrations** (`supabase/migrations/*.sql`) — paste into Supabase Dashboard →
SQL Editor → New query → Run. Read the verification table at the bottom of the
file; do not assume it landed. They must be idempotent and transactional (see
the rules above).

**Lookup config publishes** — do not hand-edit:

```bash
npm run publish:gmo      # regenerate + verify supabase/publish-gmo-v1.1.sql
npm run lookup:status    # read-only: what is the DB serving right now?
```

Then paste `supabase/publish-gmo-v1.1.sql` into SQL Editor and Run. Re-run
`npm run lookup:status` afterwards to confirm.

⚠️ **Clients cache the published config for 5 minutes** (`CACHE_MAX_AGE`). A
device that scanned just before a publish keeps using the old ruleset until that
window elapses — clear site data or wait before judging the change.