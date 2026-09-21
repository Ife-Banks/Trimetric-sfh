# Trimetric-SFH — UI/UX Redesign + Public Account Completion

Two phases. Do Phase A first, verify it, then Phase B. Do not skip
verification between them — Phase B's login/register screens depend on
Phase A actually working.

---

## PHASE A — Close the remaining account-system gaps

Most of this already exists (three-role model, Google OAuth, auto-profile
trigger, submissions_read_own RLS, anonymous scanning preserved — confirmed
by reading the migrations directly). Only these are missing:

1. Enable Facebook and Apple as additional Supabase Auth OAuth providers
   alongside the existing Google one. Add matching buttons to the public
   sign-up/sign-in flow (NOT the admin sign-in — that stays email+password,
   superadmin-provisioned only, no public sign-up, per the existing
   SignInForm comment).
2. Add an explicit "Continue as Guest" affordance on the public
   login/register screen — this needs no backend change, it simply closes
   the auth screen and proceeds to the anonymous scan flow that already
   works without an account.
3. Rename the History page's tab (or add a second tab) to read
   "Submissions" rather than implying a separate "Scans" log — there is no
   scan-log table, and we are NOT building one in this pass. If a full scan
   history becomes a real requirement later, that's a new table and a
   separate task, not something to improvise here.
4. Treat "Premium Member" and any streak/gamification badge as static,
   decorative UI only — no gating logic, no backend field to support it.
   Do not wire it to anything real; there is no billing system.

Show me the OAuth provider config once done (which providers are enabled,
callback URLs) and confirm the guest-mode path still reaches the scan flow
with zero auth friction before moving to Phase B.

---

## PHASE B — Visual redesign

Act as a senior product designer and senior frontend engineer.

### Visual target

**Clean, trusted consumer-health application** — think a calm, credible
health utility, not a SaaS dashboard and not a gamified consumer app. The
existing Fluoroscan Figma screens are the reference; match them faithfully
rather than reinterpreting the brief in the abstract.

Characteristics:
- Light theme as the primary/default experience. Dark mode may still exist
  as a secondary option (the existing shadcn token system already supports
  `dark:` variants) but the brand identity — the teal/mint gradients, the
  tooth-and-leaf mark — is a light-theme identity. Do not default to dark
  or invent a purple accent; none of that appears in the reference screens.
- Soft mint-to-cyan gradient backgrounds on entry/marketing-style screens
  (onboarding, auth); clean white/near-white surfaces on functional screens
  (home, capture, verdict, admin).
- Primary CTA color: a confident mid-blue (as seen on "Next" / "Get
  Started" / "Register" / "Login" buttons).
- Two category accent colors, used consistently everywhere that category
  appears: green for GMO/food, blue for fluoride/oral-care. This mapping
  should hold across icons, tags, and card accents — it's a wayfinding
  system, not decoration.
- Rounded, friendly geometry: large-radius cards (16–20px), pill-shaped
  buttons and tags, soft shadows — but restrained, not glassmorphic.
- Generous whitespace, one clear primary action per screen.
- Consistent iconography (outline style, single weight, matching the
  existing onboarding illustrations' line quality).
- Smooth, subtle transitions (150–250ms) on button states, modal/sheet
  open, and the capture-guide corner brackets.
- Every loading state should feel purposeful, not generic — the existing
  "Analyzing product… / Reading product label / Checking ingredients /
  Verifying fluoride levels / Calculating trust score" step-list pattern
  from the reference is exactly right and should be built for real: each
  line should reflect an actual pipeline stage (OCR extraction, engine
  matching, confidence scoring) completing in sequence, not a fake timer.

### Non-negotiable structural fix — read this before touching the verdict screen

The reference screens' "Diagnostic Result" circular percentage gauge
conflates Result and Confidence into one number, and the specific example
data in those mockups is internally inconsistent (one card shows "92%
High" alongside "0 ppm Detected / Missing" and "No active fluoride
quantified" — a contradiction; another shows 1,100 ppm, which is this
project's own "Standard Adult Strength" threshold, mislabeled "Low"). Do
not carry either the merged-badge structure or any of that literal
placeholder data into the real implementation.

Keep the circular gauge as a strong, distinctive visual element — it looks
good and is worth preserving — but it represents **Result only**:
- Fill proportion and color come from `result.tier` (low/medium/high/none),
  not a fabricated percentage. If you want a numeric readout inside the
  ring, it should be the real ppm value (fluoride) or the real N-count
  framing (GMO), never an invented "match %."
- `ConfidenceBadge` (already correctly built — do not restructure it,
  just restyle its colors to this palette) sits as a clearly separate
  element directly beside or below the gauge. It must remain visually
  distinguishable at a glance, exactly as its existing code comments
  describe — restyling colors is fine, collapsing it into the gauge or
  making it a same-shaped variant is not.
- The reference's "Verified Criteria" / "Verification Findings" checklist
  under each result maps directly onto `confidence.factors` — this is
  good, keep this structure, just wire it to the real array instead of
  static mockup text.
- The GMO_CONSTRAINT_NOTICE / fluoride constraint text must always render,
  exactly as `ConstraintNotice.tsx` already does — do not let a "Why this
  result" free-text box replace or paraphrase it away.

### Screen-by-screen notes

- **Onboarding carousel:** fix the naming inconsistency — the first slide
  says "SafeScan," every other screen says "Fluoroscan." Use Fluoroscan
  throughout.
- **Home hub:** the two-card layout (GMO Check / Fluoride Scan) as
  distinct entry points is good and should be kept — this is a legitimate
  UX choice (explicit mode selection) layered on top of the existing
  auto-classification routing in FR-4; the auto-classification still runs
  after capture regardless of which card the user tapped, it's not being
  removed.
- **Capture flow:** the two-step (front/back) flow with corner-bracket
  alignment guide and gallery/capture buttons matches the existing
  `CameraView`/`CaptureGuide` components — this is styling, not new
  logic.
- **Community Lab (submission form):** add a required, editable
  **Ingredients Text** field, pre-filled from OCR. The current design only
  has a single-line "Fluoride Concentration" field and photo uploads —
  admin's recompute preview needs real ingredients text to re-run the
  engine against, a concentration number alone isn't sufficient. Also fix
  the duplicate "Product Front Photo" label on the second photo upload —
  it should read "Product Back Photo" per its own helper text ("Captures
  chemical ppm text directly").
- **No-match / "Unverified Product" state:** good as designed, maps
  directly to the existing low-confidence/no-match trigger — just needs
  restyling.
- **Admin review queue:** apply the same design tokens, but keep it
  visually distinct in tone from the public-facing screens (denser,
  table-oriented, no marketing-style gradients) — it's a working tool for
  a reviewer, not a consumer surface.

### Constraints (preserve exactly)

- Preserve all existing functionality; do not change API contracts,
  database schema (beyond Phase A's OAuth config, which is Supabase
  dashboard configuration, not a migration), or authentication/
  authorization logic.
- Do not restructure `ResultBadge` or `ConfidenceBadge` — restyle their
  color tokens only. Their shape difference is a deliberate, documented
  constraint (`06_AGENT_CONTEXT.md` §2, `03_FRONTEND_ARCHITECTURE.md` §3).
- Reuse the existing shadcn-based component set
  (`button`, `card`, `badge`, `input`, `select`, `dropdown-menu`, `alert`,
  etc.) — restyle the shared tokens, don't fork parallel one-off
  components per screen.
- Run the full test suite after the redesign and confirm all 101 tests
  still pass — this should be a pure styling/markup pass, not a logic
  change, so nothing should break. If something does, that's a signal a
  change went further than intended.

### Process

1. Establish design tokens first (colors, radius, spacing, type scale) as
   Tailwind config / CSS variables, extracted from the reference screens.
2. Restyle the shared `ui/` primitives.
3. Redesign the home hub and capture flow.
4. Redesign the verdict screen per the structural fix above — this is the
   highest-stakes screen, take the most care here.
5. Redesign the submission form (with the added ingredients-text field)
   and the no-match state.
6. Restyle auth (public login/register with the three OAuth buttons +
   guest option, admin sign-in kept structurally separate).
7. Restyle the admin review queue and history page.
8. Full responsive pass (mobile primary, then tablet/desktop for admin).
9. Accessibility pass — contrast, focus states, keyboard nav.
10. Run `npx vitest run` and confirm 101/101 still pass.

Show me the token file and the redesigned verdict screen first, before
proceeding through the rest of the screens — that's the one place a
subtle mistake would matter most.

---

## Docs to update once both phases land

Update `docs/01_TECHNICAL_SPECIFICATION.md`'s scope section: move "user
accounts beyond anonymous scanning" out of Out-of-Scope — it's now
in-scope and mostly built. Note explicitly that a per-user *scan* history
(distinct from submission history) remains deferred/out of scope, and that
Premium/streak elements are decorative only, not gated features. Do this
edit yourself in the repo — the docs should reflect what's actually true
of the codebase now.
