# Trimetric-SFH (Fluoroscan)

A mobile-first PWA that photographs a product label, reads it with OCR, and
returns a **deterministic, label-based verdict** with a separate confidence
rating:

| Category | Verdict |
|---|---|
| Packaged food (`gmo_food`) | GMO likelihood — Low / Medium / High, from the count of distinct crop families found |
| Oral care (`oral_care`) | Fluoride content — Fluoride-Free / Low / Standard / High, from ppm read off the label |

Result and confidence are two independent values, never merged. Low confidence
invites the user to submit a correction, which enters an admin review queue and
— once a human approves it — becomes part of the verified catalogue.

**Read `AGENTS.md` before changing anything.** It carries the non-negotiable
product constraints and the verified local-development constraints.

---

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript** · **Tailwind v4**
- **Supabase** — Postgres, Auth (three roles: user / admin / superadmin), Storage, RLS
- **Tesseract.js** — client-side OCR in a Web Worker, self-hosted assets
- **Zod** — shared client + server validation
- **Vitest** — unit + validation suites

## Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm run test:all     # typecheck + lint + unit tests  <- run this before committing
npm run test         # unit tests only
npm run test:ocr     # real OCR stack against a committed fixture (needs npm run ocr:assets)
npm run test:rls     # anon-key RLS verification against the hosted project
npm run test:e2e     # Playwright full-loop test (⚠ writes to the database — see below)
npm run audit:high   # dependency audit at high severity
npm run ocr:assets   # vendor Tesseract worker/core/traineddata into public/

npm run lookup:status  # READ-ONLY: what rulesets is the database serving right now?
npm run publish:gmo    # regenerate supabase/publish-gmo-v1.1.sql (does not touch the DB)
npm run palette:check  # fail if any component has an unmapped literal colour
```

### Theming

Light is the primary identity; dark is supported via `prefers-color-scheme`.

- **Never hardcode a colour in a component.** Use a token from
  `src/app/globals.css`. This includes Tailwind's built-in palette — `bg-white`
  and `text-white` have no `dark:` variant, so a surface written that way stays
  white while its text inverts to near-white and becomes unreadable. Use
  `bg-surface` for surfaces and `text-ink-on-brand` for text on a saturated fill.
- The only permitted raw hex values are the third-party brand marks in
  `ProviderGlyph.tsx` and the build-time `themeColor` meta in
  `src/app/layout.tsx` (Next resolves that at build time, where no CSS variable
  can reach).
- `npm run palette:check` runs in CI and fails on anything else.

**A passing build is not proof.** Tailwind compiles both a literal hex and an
invalid arbitrary value without complaint. After changing colours, load the page
and check computed styles in both themes — a contrast audit caught nine elements
sitting at 1.1:1 in dark mode while every static check passed.

### Changing a lookup table

Lookup configs are data, versioned in `lookup_config`. To change one:

1. Edit `data/<category>_lookup_config_vN.json` and **bump its `version`**.
2. For GMO: `npm run publish:gmo` regenerates the publish SQL from that JSON.
3. Apply the SQL in the **Supabase Dashboard → SQL Editor** (one transaction —
   `one_published_per_category` allows only one published row per category, so
   unpublishing and publishing cannot be separate calls).
4. `npm run lookup:status` to confirm.

`products.config_version` records which ruleset produced each stored verdict,
which is how you find and recompute rows that were scored under an older table.
Never edit the published `config_json` in place without bumping the version —
the client rejects any row where `config_json.version` and `version` disagree.

CI (`.github/workflows/ci.yml`) runs `test:all`, the audit, a build, and greps
the build output for the service-role key. All of it must be green.

## Setup

1. `npm install`
2. Copy `.env.local.example` → `.env.local` and fill in your hosted Supabase
   project values. The service-role key must **never** carry a `NEXT_PUBLIC_`
   prefix.
3. `npm run ocr:assets` (vendors ~17 MB of Tesseract assets; they are
   gitignored).
4. Apply the schema:
   ```bash
   supabase link --project-ref <your-ref>
   supabase db push
   ```
   **Never run `supabase start` or any Docker-based local stack.** This project
   targets a hosted Supabase project.
5. Seed `lookup_config` and `products` from `supabase/seed.sql` via the
   dashboard SQL editor.
6. `npm run dev`

> If `npm run typecheck` fails with `Cannot find name 'LayoutProps'`, run
> `npx next typegen` first — Next generates those route types into `.next`.

## Architecture

```
capture (getUserMedia) → OCR (Tesseract.js, Web Worker) → normalize
   → category router → ONE engine (gmoEngine | fluorideEngine)
   → EngineResult → verdict UI
                         ↓ (low confidence)
                    submission → admin queue → products
```

Key rules:

- **One pipeline, two pluggable engines.** GMO and fluoride never run on the same
  product. Everything except the two engine modules and their lookup tables is
  shared.
- **`src/engines/` imports nothing from `src/lib/`, no React, no Supabase.**
  Shared thresholds live in `engines/constants.ts`, tokenization in
  `engines/normalize.ts`. This is what keeps the engines unit-testable in
  isolation.
- **The engine is the single source of truth for every displayed number.** The
  result gauge reads `EngineResult.matchedTerms[].detail`; it never re-parses
  the OCR text.
- **Anonymous users propose; only admins publish.** Enforced by RLS, not by the
  UI. Anonymous writes are constrained at the database layer, because the anon
  key ships in the client bundle.

## Documentation

| Document | Contents |
|---|---|
| `AGENTS.md` | Non-negotiable constraints, verified local-dev constraints, DoD |
| `docs/01_TECHNICAL_SPECIFICATION.md` | Functional requirements, `EngineResult` contract |
| `docs/02_SYSTEM_ARCHITECTURE.md` | Layer map, request flows, trust boundaries |
| `docs/03_FRONTEND_ARCHITECTURE.md` | Routes, layout, component responsibilities, testing |
| `docs/04_BACKEND_STRUCTURE.md` | Schema, RLS policies, `approve_submission()` |
| `docs/05_SECURITY_ASSESSMENT.md` | Findings, remediations, pre-launch checklist |
| `docs/06_AGENT_CONTEXT.md` | Product framing, build order, implementation notes |
| `docs/GMO_Build_Guide.md` / `docs/Fluoride_Build_Guide.md` | Scoring rules — authoritative |
| `docs/08_DESIGN_SYSTEM.md` | Tokens, components, visual QA checklist |
| `docs/07_GMO_DATASET_QA_REVIEW.md` | Lookup dataset provenance and known issues |
| `docs/09_USER_GUIDE.md` | Every screen, the GMO/fluoride computation logic, the OCR pipeline |
| `docs/10_VERCEL_DEPLOYMENT.md` | Vercel deployment checklist (env, Supabase, OCR assets, PWA) |

When you change behaviour, update the relevant doc in the same commit. The docs
are the contract; drift between them and the code is a bug.

## Known gaps

See the Definition of Done in `AGENTS.md` for the live list. The significant
ones: no component tests guarding the two-badge constraint, no end-to-end test,
`test:rls` is still run by hand, and admin MFA is code-enforced but not yet
enrolled.
