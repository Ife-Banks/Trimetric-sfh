# Deploying MUTAGENIC to Vercel

> **Goal:** a reproducible production deployment on Vercel of the Next.js 16 app
> in this repo, pointed at the hosted Supabase project, with client-side OCR
> assets present and the PWA behaving.

This is a checklist plus the reasoning behind the non-obvious items. Work through
it top to bottom; the sections marked **⚠ blocking** will break the deployment if
skipped.

---

## 0. TL;DR checklist

- [ ] Supabase: add the Vercel domain(s) to **Auth → URL Configuration** (Site URL
      + Redirect URLs) — **⚠ blocking for OAuth / email confirmation**
- [ ] Supabase: confirm the `submission-images` bucket exists and its CORS allows
      the Vercel origin
- [ ] Vercel: create the project from this Git repo (auto-detects Next.js)
- [ ] Vercel: set the four environment variables (see §3) — **⚠ blocking**
- [ ] Vercel: make sure OCR assets are produced at build time (§2) — **⚠ blocking**
- [ ] Vercel: Node **22.x**, a region near your Supabase project
- [ ] Confirm `package-lock.json` is committed (so `npm ci` works)
- [ ] Add the custom domain, then add it to the Supabase allowlist too
- [ ] Post-deploy smoke test (§8)

---

## 1. What Vercel needs to know about this app

| Thing | Value |
|---|---|
| Framework | Next.js **16.3.5** (App Router, `src/`, `@/*` alias) — auto-detected |
| Install | `npm ci` (default) — requires `package-lock.json` committed |
| Build | `next build`, **but see §2** — OCR assets must be generated first |
| Output | Next.js default (`.next`) — **do not** set `output: "standalone"` for Vercel |
| Node | **22.x** (matches CI; no `engines` field pins it, so set it in the project) |
| Serverless | API routes only (`/api/submissions`, `/api/admin/*`). **OCR runs in the browser**, so there is no heavy compute or long-timeout function to size |

There is **no `middleware.ts`**, no Docker, and no server-side image processing —
the deploy is a plain Next.js build.

---

## 2. ⚠ Blocking — the OCR assets are gitignored

The Tesseract worker, WASM core and English language data live under
`public/vendor/tesseract/` and are **excluded from git** (`.gitignore`), and the
raw `eng.traineddata` is also ignored. They are produced locally by:

```bash
npm run ocr:assets
```

If Vercel just runs `next build`, those files will not exist in the deployment, and
**every scan will fail at OCR** (the worker will 404 on
`/vendor/tesseract/worker.min.js`).

The fix is a Vercel-only build command that fetches them before building. This repo
already ships a [`vercel.json`](../vercel.json) that does exactly that:

```json
{
  "buildCommand": "npm run ocr:assets && next build"
}
```

`ocr:assets` copies the worker/core from `node_modules` (present after install) and
downloads `eng.traineddata.gz` (~11 MB) from the public tessdata mirror — a network
connection is available during a Vercel build, so this works without committing the
binaries. The generated files under `public/` are served as static assets from
Vercel's CDN (≈18 MB total; not part of any function bundle).

**Do not** commit the assets instead. They are gitignored on purpose (size +
third-party code); letting the build regenerate them keeps the repo clean.

> If you prefer to configure this in the dashboard rather than `vercel.json`, set
> **Build Command** to `npm run ocr:assets && next build` in
> *Project → Settings → Build & Development Settings*. Do not set it in **both**
> places with different values.

---

## 3. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** for
**Production** (and **Preview** if you want preview URLs to work). Copy the values
from your local `.env.local`:

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Hosted Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Public by design — RLS is the control |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | ⚠ **Never** give this a `NEXT_PUBLIC_` prefix. It is used only by the superadmin "create reviewer" flow |
| `ADMIN_MFA_REQUIRED` | server | `"false"` until every admin has enrolled a TOTP authenticator, then `"true"` |

Rules of thumb:

- **Never** prefix the service-role key with `NEXT_PUBLIC_`. CI greps the build
  output for its value and fails on a match; keep that guarantee by not pasting it
  anywhere client-visible.
- The `.env*` files are gitignored, so nothing is deployed from your machine — the
  Vercel dashboard is the only source of truth in production.
- If you deploy a **Preview** environment, its URL and env vars matter too — see §4,
  because OAuth redirects must allow every host you actually sign in from.

> **This app points at a single Supabase project** (the ref in
> `.env.local.example`). Deploying to Vercel does not change that. Treat that
> Supabase project as **production**: its data is what your users hit. The security
> checklist wants staging on a **separate** Supabase project — if you want a
> preview/staging deploy, create a second Supabase project, apply the migrations
> (`supabase link` + `supabase db push`) and seeds, and point Preview at it.

---

## 4. ⚠ Blocking — Supabase configuration for the deployed origin

The app performs OAuth and email flows that return to `https://<your-domain>/auth/callback`.
Supabase will reject a redirect that is not on its allowlist, so this is a hard
prerequisite, not a nicety.

In **Supabase → Authentication → URL Configuration**:

1. **Site URL** → `https://<your-domain>` (or the Vercel production URL).
2. **Redirect URLs** → add, one per line:
   - `https://<your-domain>/auth/callback`
   - `https://<your-domain>/auth/reset-password`
   - `https://<vercel-preview>.vercel.app/auth/callback` (if you use previews)
   - `http://localhost:3000/auth/callback` (keep for local dev)

This covers Google/Facebook/Apple sign-in, email signup confirmation, and password
reset. The provider credentials themselves (Google client ID/secret, etc.) live in
the same Supabase Auth settings — enabling a provider is dashboard configuration,
not a migration.

**Storage CORS.** Submission photos are uploaded **directly from the browser** to
the private `submission-images` bucket. If you have restricted Storage's allowed
origins, add `https://<your-domain>`; the default policy is permissive, but verify
it, otherwise submission uploads silently fail on the deployed origin.

**Database objects already in place** (do not recreate): the
`search_products_by_name` and related RPCs, the `count_pending_submissions`
function, the `scans`/`submissions`/`products`/`lookup_config`/`profiles` tables,
RLS policies, and the storage bucket. If you point at a **fresh** Supabase project,
apply everything first:

```bash
supabase link --project-ref <new-ref>
supabase db push       # runs every migration in supabase/migrations
# then seed lookup_config + products from supabase/seed*.sql via the SQL editor
```

---

## 5. PWA, service worker and headers

- The app is a **PWA** (`public/manifest.json`, icons, `public/sw.js`). Service
  workers require **HTTPS**, which Vercel provides automatically — including on
  `*.vercel.app` and custom domains.
- `public/sw.js` is served from `public/` at scope `/`. `vercel.json` sets a
  `no-cache` header on `/sw.js` and `/manifest.json` so clients always pick up a
  new worker/manifest after a deploy. The worker itself uses `network-first` for
  navigations, so auth redirects are never served from cache.
- **Security headers** (`X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy` with `camera=(self)`, HSTS, and a CSP
  that permits `wasm-unsafe-eval` for Tesseract) are already declared in
  `next.config.ts`, and are applied **only when `NODE_ENV === "production"`** — so
  they switch on for the Vercel production build and are skipped in local dev.
- **⚠ Do not remove `'unsafe-inline'` from `script-src`.** The App Router streams
  its RSC payload through inline `<script>self.__next_f.push(…)</script>` tags;
  with `script-src 'self'` the browser blocks them, React never receives the
  streamed payload, and hydration dies with **"Connection closed"** (React #412).
  The page still renders, so it looks like a mysterious blank/inert app rather
  than a policy error. Removing it requires a per-request nonce (middleware + all
  pages forced dynamic). `src/lib/security/csp.test.ts` fails if it goes missing.
- **Vercel Toolbar**: the CSP allows `https://vercel.live` (script/connect/img/
  frame/style/font) and `wss://ws-us3.pusher.com` so the preview toolbar and
  comments work. If you would rather not allow it, disable the toolbar in
  **Vercel → Project → Settings → General → Vercel Toolbar** and drop those
  origins from the CSP.
- The **mobile-only gate** ships as part of the UI: desktop visitors get the
  "Switch to a mobile device" notice instead of the app. `/admin` opts out of the
  gate (it is a desk task). If your stakeholders want to view the app on desktop,
  that is a product decision, not a deployment setting.

---

## 6. Create the Vercel project

1. **Import** the Git repository into Vercel. Vercel auto-detects Next.js, the
   install command (`npm ci`) and the build output.
2. **Root directory:** the repo root (there is no monorepo layout).
3. **Node.js version:** set **22.x** (Project → Settings → General).
4. **Build command:** leave it to `vercel.json`'s `buildCommand` (the OCR step).
   If you remove the `vercel.json`, either set the build command in the dashboard
   (see §2) or scans will fail.
5. **Environment variables:** add the four from §3 (Production, and Preview if
   used).
6. **Region:** choose the region closest to your users *and* your Supabase project,
   to minimise auth/DB round-trip latency.
7. **Deploy.** The first build will fetch the OCR assets, then run `next build`.

Do not add `output: "standalone"`, a custom `distDir`, or a Dockerfile — none are
needed and `standalone` changes how Vercel packages the app.

---

## 7. Domain

1. Add the custom domain in **Vercel → Project → Domains** and follow the DNS
   instructions. HTTPS is provisioned automatically.
2. **Re-do §4** for the real domain: add `https://<custom-domain>/auth/callback`
   and `/auth/reset-password` to the Supabase Redirect URLs, and add the origin to
   Storage CORS.
3. If you had already deployed on the `*.vercel.app` URL, keep that host in the
   Supabase allowlist during the transition (or users mid-flow will bounce).

The CSP already allows `'self'` plus `https://*.supabase.co`, so no CSP change is
needed for a custom domain. A www/non-www variant (and any additional hostname) is
a **separate origin** for both Supabase redirects and browser storage — decide on
one canonical host and redirect the other.

---

## 8. Post-deploy smoke test

Run these against the deployed URL on a **phone** (the gate hides the app on
desktop):

1. **Onboarding** loads and the Next/Skip footer is reachable; the carousel is not
   clipped.
2. **Hub** (`/guest-dashboard`) renders flow cards and **live** trust metrics
   (not zeros).
3. **Guest scan, food**: capture front + back of a real label → a verdict renders
   with a **separate** confidence badge and the constraint notice. Watch the
   browser console: OCR failures and a false "not in catalogue" are logged with the
   numbers that separate them.
4. **Guest scan, oral care**: `/scan?category=fluoride` → a fluoride verdict, or an
   honest "No Data".
5. **Contribution**: from a low-confidence/unmatched result, submit a product with
   a photo. Confirm the photo uploads (Storage CORS) and the row appears under
   **History → Contributions** as pending.
6. **Auth**: Google sign-in (or email signup confirmation) round-trips to
   `/auth/callback` and lands on the hub. If it fails with a redirect error, §4 is
   incomplete.
7. **PWA**: install to the home screen; load once online, then toggle offline and
   confirm the app shell / offline page appears.
8. **Desktop gate**: open the same URL on a laptop → "Switch to a mobile device".
   `/admin` on the same laptop still renders for an admin.
9. **Admin** (with a reviewer account): queue loads, a photo mints a signed URL,
   approve/reject work.
10. **Headers**: check the response for `Strict-Transport-Security`, the CSP, and
    `Permissions-Policy: camera=(self)` on the deployed origin.

---

## 9. Ongoing / CI notes

- `.github/workflows/ci.yml` runs on every push and PR: typecheck, lint, unit
  tests, `palette:check`, the lookup-config consistency check, `npm audit`, a
  build, and greps the build output for the service-role key. Connecting the repo
  to Vercel means each push to the production branch deploys — **let CI pass
  first**, or deploy from a branch and promote.
- The **in-memory rate limiter** on `POST /api/submissions` is per server
  instance. On Vercel, multiple instances each allow their own quota, so the
  effective limit is higher than configured. The primary control remains the
  database RLS policy for anonymous inserts; if you need real per-IP limits,
  back the limiter with a shared store (e.g. Redis) later.
- **`ADMIN_MFA_REQUIRED`**: leave `false` until every admin has enrolled a TOTP
  authenticator. Flipping it early locks admins out of `/api/admin/*`.
- **Ruleset changes** do not need a redeploy — publish a new `lookup_config` row
  and the client picks it up (it validates the version and caches briefly).

---

## 10. Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Every scan hangs / "could not read" on a good photo | OCR assets missing from the deployment | §2 — build command must run `ocr:assets` |
| OAuth returns "redirect_uri not allowed" | Vercel domain not in Supabase Redirect URLs | §4 |
| Submission photo upload fails | Storage CORS doesn't allow the origin | §4 |
| Signed-in users always appear as guests | `NEXT_PUBLIC_SUPABASE_*` missing/wrong at build time | §3 (rebuild after changing) |
| Admin create-account 500s | `SUPABASE_SERVICE_ROLE_KEY` not set server-side | §3 |
| Desktop shows the gate to a stakeholder | By design | `/admin` is exempt; the app itself is mobile-only |
