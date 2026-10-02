# Frontend Architecture — SHF Final Resolve

**Framework:** Next.js (App Router) · TypeScript · Tailwind CSS
**Delivery:** Mobile-first PWA
**Design source:** Figma (visual design is authoritative; this document covers structure, not styling)

---

## 1. Route structure

```
app/
├── layout.tsx                    # Root: fonts, providers, PWA meta
├── page.tsx                      # redirect → /onboarding
├── onboarding/page.tsx           # First-run carousel
├── login/  register/  auth/      # Public auth (login, register, forgot, reset, callback)
├── guest-dashboard/page.tsx      # Home hub — the two category entry points
├── scan/page.tsx                 # THE capture + OCR + engine flow (client state machine)
├── history/page.tsx              # Submissions (auth-gated)
├── settings/page.tsx            # Preferences + sign out
└── admin/
    ├── layout.tsx                # Auth gate — redirects non-admins
    ├── page.tsx                  # Review queue
    └── admins/page.tsx           # Superadmin: create admin accounts
```

**`/scan` is a single client state machine**, not three routes. It steps through
`front → back → review → analyzing → done → provisional | add | thanks`, and the
verdict, the submission form and the receipt all render inline. The earlier
`/scan/result` and `/submit` routes named in earlier revisions of this document
were superseded by that — not left unimplemented. Keep the single-flow shape; it
avoids re-hydrating camera and OCR state across a navigation.

Keep `/admin` in the same Next.js app. It's auth-gated and low-traffic; a separate deployment doubles the maintenance cost for no benefit at this scale.

---

## 2. Directory layout

```
src/
├── app/                          # routes (above)
├── components/
│   ├── capture/
│   │   ├── CameraView.tsx        # getUserMedia + viewfinder + framing overlay + gallery fallback
│   │   ├── AnalyzeScreen.tsx     # Per-stage progress checklist (real pipeline stages)
│   │   ├── StepProgressHeader.tsx# "Step N of 2" progressbar
│   │   └── ImagePreview.tsx
│   ├── diagnostic/
│   │   ├── DiagnosticResult.tsx  # SHARED — the verdict screen, renders any EngineResult
│   │   ├── UnverifiedScreen.tsx  # No catalogue match
│   │   ├── AddProductScreen.tsx  # Submission entry point
│   │   └── ThanksScreen.tsx
│   ├── verdict/
│   │   ├── ResultBadge.tsx       # pill, green/amber/red/gray
│   │   ├── ConfidenceBadge.tsx   # rectangular chip, blue/gray — never merged with ResultBadge
│   │   ├── ResultGauge.tsx       # result-only ring; number from EngineResult.detail
│   │   ├── gaugeValue.ts         # maps EngineResult → display number (never re-parses text)
│   │   ├── MatchedTermsList.tsx
│   │   ├── VerificationFindings.tsx  # confidence.factors checklist
│   │   ├── SubmissionForm.tsx    # SHARED — category-aware field set
│   │   └── ConstraintNotice.tsx  # the honesty statement
│   ├── admin/
│   │   ├── ReviewQueue.tsx
│   │   ├── SubmissionRow.tsx
│   │   └── RecomputePreview.tsx
│   └── ui/                       # primitives: Button, Badge, Field, Sheet
├── engines/
│   ├── types.ts                  # EngineResult + EngineContext contract
│   ├── constants.ts              # shared thresholds (name match, OCR penalty)
│   ├── normalize.ts              # SHARED tokenization
│   ├── gmoEngine.ts
│   ├── fluorideEngine.ts
│   └── fromProduct.ts            # stored products row → EngineResult
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # browser client (anon key)
│   │   └── server.ts             # server client (route handlers / admin) — 'server-only'
│   ├── ocr/
│   │   ├── tesseract.ts          # worker lifecycle + timeout guard
│   │   ├── ocr.worker.ts         # the actual Tesseract worker
│   │   ├── blocks.ts             # block tree → RecognizeResult
│   │   ├── image.ts              # downscale to ~1600px + canvas re-encode
│   │   └── barcode.ts            # DORMANT — not part of the active scan flow
│   ├── identification/           # category-scoped trigram name lookup
│   ├── config/
│   │   └── lookupConfig.ts       # fetch + IndexedDB cache
│   └── validation/
│       └── schemas.ts            # Zod schemas, shared client+server
└── types/
    └── database.ts               # generated from Supabase
```

**`src/engines/` has no React and no Supabase imports.** That is the rule that
keeps the rules engines testable in isolation and reusable if the project ever
moves to React Native. Shared thresholds live in `engines/constants.ts` rather
than in `lib/`, precisely so an engine never has to reach into the
Supabase-coupled identification layer to read a number.

Note: `VerdictScreen.tsx` was renamed `components/diagnostic/DiagnosticResult.tsx`.
Its responsibilities are unchanged; the older name appears in historical
comments and is not a live file.

---

## 3. Component responsibilities

### DiagnosticResult — the shared seam

```tsx
<DiagnosticResult result={engineResult} identity={productIdentity} ... />
```

It takes an `EngineResult` and renders it. It does not know or care whether `gmoEngine` or `fluorideEngine` produced it. Adding a third category (plant health) should require zero changes here.

Required elements, in order:
1. Product identity (name, brand, image thumbnail)
2. `ResultBadge` — the verdict tier, text label always present alongside colour
3. `ConfidenceBadge` — visually distinct from ResultBadge, adjacent, never merged
4. **Engine guidance** — the engine's own per-product "why it matters"
   (`EngineResult.guidance`), e.g. *"2 crop families detected — corn, soy —
   from corn syrup, soybean oil."* Falls back to generic phrasing only when
   `guidance` is blank or merely restates the constraint notice. **The engine
   must produce real guidance here; setting `guidance = constraintNotice` makes
   this element dead weight.**
5. `MatchedTermsList` — what was actually found, grouped by kind. Must render
   for **both** categories (oral care shows matched active compounds).
6. `ConstraintNotice` — always rendered, never dismissible
7. Submission CTA — **prominent** when `confidence.tier === 'low'`
   (including a *stored* verdict that came back low-confidence — a user must
   always be able to dispute a wrong catalogue answer), secondary outline
   otherwise.

Also required, per `06_AGENT_CONTEXT.md` §2 constraint 2: `ConstraintNotice`
renders on the no-match screen too, not only on the full verdict screen.

### ConfidenceBadge — the differentiation

This component carries the product's core idea. Design requirements:

- Three states, visually distinct from the result tiers (different shape or treatment, not just a different colour of the same pill — a "Low result / High confidence" and a "Low result / Low confidence" must be immediately distinguishable at a glance)
- On tap, expands to show `confidence.factors` — the human-readable reasons
- Never relies on colour alone (accessibility + the badges sit adjacent and must not blur together)

### SubmissionForm

Field set varies by category (GMO: certification dropdown; fluoride: subcategory + concentration), but it's one component reading a field config, not two forms.

Every field pre-fills from whatever the engine extracted. The user is correcting, not authoring — that's what keeps friction low enough for the contribution loop to work.

---

## 4. State management

No global state library. The app's state is shallow and mostly per-flow.

| State | Where it lives |
|---|---|
| Captured images | React state in the scan flow, passed via route state |
| `EngineResult` | Computed in the scan flow, passed to verdict screen |
| `lookup_config` | IndexedDB, read through a `useLookupConfig()` hook |
| Auth session | Supabase client session + a server-side check in `/admin/layout.tsx` |
| Submission draft | Local form state; persisted to `sessionStorage` so a failed upload doesn't lose the user's typing |

Use React Server Components for `/admin` (data fetching server-side, RLS-enforced) and client components for everything in the scan flow (camera and OCR need the browser).

---

## 5. OCR integration

Tesseract.js must run in a Web Worker. On the main thread it blocks the UI for seconds and the app appears frozen.

```
lib/ocr/tesseract.ts
  - initialise worker once, reuse across scans
  - lazy-load language data (not in the initial bundle)
  - expose: recognize(image) → { text, meanConfidence, blocks }
  - terminate worker on flow exit
```

Surface real progress to the user during recognition. A processing state with no feedback for 6 seconds reads as a crash.

`meanConfidence` feeds the engines' confidence scoring — pass it through, don't discard it.

---

## 6. Performance

| Concern | Approach |
|---|---|
| Tesseract bundle weight | Dynamic import; load only when the user enters the scan flow |
| Image size before OCR | Downscale client-side to ~1600px on the long edge before recognition — large images are slower with no accuracy gain |
| Image **rotation** before OCR | Measure skew with a horizontal projection profile (`lib/ocr/deskew.ts`) and rotate the label level, ±40° in 1° steps on a 400px grayscale buffer. **This is the single highest-value OCR step** — see below |
| Config fetch | Cache-first from IndexedDB, revalidate in the background |
| Admin queue | Server-rendered, paginated (25/page) |

#### Why tilt correction matters more than anything else in the OCR path

A user reported that a toothpaste photo "wasn't in the database" when it was. The
console trace showed the front panel yielding **29 characters of pure noise** at
0.30 confidence while the same scan's back panel read 427 characters. Running the
real Tesseract stack over one label at controlled geometries isolated the cause:

| Condition | Characters read | Brand found |
|---|---|---|
| Long edge 1200px, −20° | 0 | no |
| Long edge 1600px, −20° | 0 | no |
| Long edge 2400px, −20° | 0 | no |
| Long edge 3200px, −20° | 0 | no |
| 2400px, −20°, background removed | 0 | no |
| 2400px, **0°** | **69**, confidence 0.9 | **yes** |

Resolution changed nothing across a 2.7× range. Removing the background changed
nothing. Grayscale and Otsu binarisation changed nothing. PSM 6 and PSM 11 did not
rescue the tilted shot. **Only the angle mattered** — Tesseract's page
segmentation assumes roughly level text, so a tube held diagonally in a hand
defeats it entirely.

With correction applied, the same failing scenario end-to-end:

```
[scan] prep · skew · front 20.00° · back 0.00°
[scan] ocr · front · confidence 0.940 · 40 chars
       text: SENSODYNE PRONAMEL GENTLE ROUTINE REPAIR
[scan] identify · "SENSODYNE" → similarity 1.000 → MATCH "Sensodyne Pronamel Daily Protection"
```

**0.30 → 0.94 confidence; noise → the product name; no match → a stored verdict.**

Two consequences worth preserving:

- `prepareBlobForOcr` is separate from `downscaleBlob` because the latter also
  produces the submission evidence photo. The evidence must stay as the user shot
  it.
- The honest *"We couldn't read the front label"* screen remains as the fallback
  for photos too degraded to rescue. Correcting tilt is not a licence to claim a
  read that did not happen.

---

## 7. PWA requirements

- `manifest.json` with icons, `display: standalone`, portrait orientation — `public/manifest.json`, `theme_color` must match `--background` in `globals.css` or the splash screen flashes a mismatched colour
- Service worker caching the app shell; **NOT** Supabase responses (cross-origin, and API responses are one-shot)
- `lookup_config` is cached in **IndexedDB** by `lib/config/lookupConfig.ts` rather than by the service worker, which cannot see cross-origin Supabase requests. This satisfies the offline requirement and is the better mechanism.
- Camera requires HTTPS — note this for local testing on a phone (use a tunnel, not `localhost` over LAN)
- iOS Safari: `getUserMedia` requires a user gesture to start; don't auto-open the camera on mount. This is also why, after a capture, the viewfinder returns to its startable state rather than silently re-opening the camera.

---

## 8. Accessibility

- Result and confidence conveyed by text + shape, never colour alone
- Camera flow has a file-upload fallback for users who can't use a live camera
- Form fields properly labelled; submission errors announced via `aria-live`
- Minimum 44px touch targets throughout the scan flow

---

## 9. Testing

| Layer | Approach | Status |
|---|---|---|
| Engines | Unit tests with fixture ingredient strings — highest value tests in the project | ✅ `gmoEngine.test.ts`, `gmoEngine.validation.test.ts` (75 hand-labelled real products), `fluorideEngine.test.ts`, `fromProduct.test.ts` |
| Engine ↔ UI contract | `gaugeValue.test.ts` runs the **real engine** and asserts the displayed number is the engine's own | ✅ |
| Scan pipeline | `lib/scan/pipeline.test.ts` — realistic OCR text in, `EngineResult` out, both categories, catalogue-match short-circuit | ✅ |
| **Two-badge constraint** | `verdict/badges.test.tsx` (jsdom) — asserts `ResultBadge` and `ConfidenceBadge` keep different shapes, disjoint hue families, and text labels across all 9 tier combinations | ✅ |
| Validation / Zod | `schemas.test.ts`, `rateLimit.test.ts`, `productIdentification.test.ts` | ✅ |
| OCR | `scripts/ocr-smoke.spec.ts` runs the real Tesseract stack against a committed fixture | ✅ separate config (`npm run test:ocr`) |
| Flows | One end-to-end test: scan → low confidence → submit → appears in queue | ⚠️ **partially executed** — `e2e/contribution-loop.spec.ts`, 6 serial steps through approve and the stored-verdict re-scan. Steps 1–2 (scan → verdict → pre-filled correction form) pass against the real app; steps 3–6 write to `products` and are unrun pending a dedicated test Supabase project. |

Component tests use `// @vitest-environment jsdom` per file, so the rest of the
suite stays on the fast node environment.

**OCR in E2E is stubbed** through the seam in `src/lib/ocr/tesseract.ts`
(`window.__SHF_OCR_WORKER_FACTORY__`, honoured only outside production builds).
Real Tesseract needs ~10 MB of traineddata, takes seconds per image, and returns
text that varies run to run — none of which can support an assertion of an exact
verdict. Routing, the engines, the API, RLS, storage, the admin queue and the
approve transaction are all real.

**The E2E suite writes to the database** — it approves a submission into
`products` and promotes a real admin account. `playwright.config.ts` refuses to
start unless `E2E_ALLOW_WRITES=1` *and* the target project ref differs from
production. This is why `02_SYSTEM_ARCHITECTURE.md` §7 requires a separate
staging project.
