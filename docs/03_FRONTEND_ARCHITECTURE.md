# Frontend Architecture — SHF Final Resolve

**Framework:** Next.js (App Router) · TypeScript · Tailwind CSS
**Delivery:** Mobile-first PWA
**Design source:** Figma (visual design is authoritative; this document covers structure, not styling)

---

## 1. Route structure

```
app/
├── layout.tsx                    # Root: fonts, providers, PWA meta
├── page.tsx                      # Landing / start scan
├── scan/
│   ├── page.tsx                  # Capture flow (client component)
│   └── result/page.tsx           # Verdict screen
├── submit/
│   └── page.tsx                  # Submission form (low-confidence path)
├── admin/
│   ├── layout.tsx                # Auth gate — redirects non-admins
│   └── page.tsx                  # Review queue
└── api/
    └── ocr-fallback/route.ts     # Optional server OCR (feature-flagged)
```

Keep `/admin` in the same Next.js app. It's auth-gated and low-traffic; a separate deployment doubles the maintenance cost for no benefit at this scale.

---

## 2. Directory layout

```
src/
├── app/                          # routes (above)
├── components/
│   ├── capture/
│   │   ├── CameraView.tsx
│   │   ├── CaptureGuide.tsx      # framing overlay for front/back
│   │   └── ImagePreview.tsx
│   ├── verdict/
│   │   ├── VerdictScreen.tsx     # SHARED — renders any EngineResult
│   │   ├── ResultBadge.tsx
│   │   ├── ConfidenceBadge.tsx   # SHARED — never merged with ResultBadge
│   │   ├── MatchedTermsList.tsx
│   │   └── ConstraintNotice.tsx  # the honesty statement
│   ├── submission/
│   │   └── SubmissionForm.tsx    # SHARED — category-aware field set
│   ├── admin/
│   │   ├── ReviewQueue.tsx
│   │   ├── SubmissionRow.tsx
│   │   └── RecomputePreview.tsx
│   └── ui/                       # primitives: Button, Badge, Field, Sheet
├── engines/
│   ├── types.ts                  # EngineResult contract
│   ├── gmoEngine.ts
│   ├── fluorideEngine.ts
│   ├── normalize.ts              # SHARED tokenization
│   ├── router.ts                 # category classification + dispatch
│   └── __tests__/                # unit tests per engine
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # browser client (anon key)
│   │   └── server.ts             # server client (route handlers / admin)
│   ├── ocr/
│   │   ├── tesseract.ts          # worker lifecycle
│   │   └── barcode.ts
│   ├── config/
│   │   └── lookupConfig.ts       # fetch + IndexedDB cache
│   └── validation/
│       └── schemas.ts            # Zod schemas, shared client+server
└── types/
    └── database.ts               # generated from Supabase
```

**The `engines/` directory has no React imports.** That is the rule that keeps the rules engines testable in isolation and reusable if the project ever moves to React Native.

---

## 3. Component responsibilities

### VerdictScreen — the shared seam

```tsx
<VerdictScreen result={engineResult} product={productIdentity} />
```

It takes an `EngineResult` and renders it. It does not know or care whether `gmoEngine` or `fluorideEngine` produced it. Adding a third category (plant health) should require zero changes here.

Required elements, in order:
1. Product identity (name, brand, image thumbnail)
2. `ResultBadge` — the verdict tier, text label always present alongside colour
3. `ConfidenceBadge` — visually distinct from ResultBadge, adjacent, never merged
4. Guidance text — plain language "why it matters"
5. `MatchedTermsList` — what was actually found, grouped by kind
6. `ConstraintNotice` — always rendered, never dismissible
7. Submission CTA — prominent when confidence is low, secondary otherwise

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
| Config fetch | Cache-first from IndexedDB, revalidate in the background |
| Admin queue | Server-rendered, paginated (25/page) |

---

## 7. PWA requirements

- `manifest.json` with icons, `display: standalone`, portrait orientation
- Service worker caching the app shell and `lookup_config`
- Camera requires HTTPS — note this for local testing on a phone (use a tunnel, not `localhost` over LAN)
- iOS Safari: `getUserMedia` requires a user gesture to start; don't auto-open the camera on mount

---

## 8. Accessibility

- Result and confidence conveyed by text + shape, never colour alone
- Camera flow has a file-upload fallback for users who can't use a live camera
- Form fields properly labelled; submission errors announced via `aria-live`
- Minimum 44px touch targets throughout the scan flow

---

## 9. Testing

| Layer | Approach |
|---|---|
| Engines | Unit tests with fixture ingredient strings — highest value tests in the project, write these first |
| Components | Render tests for VerdictScreen against sample `EngineResult` fixtures for each tier combination |
| Flows | One end-to-end test: scan → low confidence → submit → appears in queue |

Nine `VerdictScreen` fixtures (3 result tiers × 3 confidence tiers) catch most UI regressions cheaply.
