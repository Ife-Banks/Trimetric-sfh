# Design System — MUTAGENIC

**Brand structure:** MUTAGENIC is the umbrella brand. It has two flows, each
named on its own screens: **GMO Check** (food, green) and **Fluoride Scan**
(oral care, blue). Which flow you are in is carried by the category accents
(`--accent-gmo` / `--accent-fluoride`), never by duplicating the shell — the hub
at `/guest-dashboard` is where the two meet, and it is where "Continue as
Guest", sign-in and post-signup all land. Surfaces that run *before* a flow has
been chosen (onboarding, auth) speak in the umbrella accent
(`--accent-mutagenic`), because borrowing either category colour there would
imply that flow had already been picked.

**Visual identity:** clean, trusted consumer-health application. Light theme
as default and primary; dark mode supported as a secondary option using the
same tokens, never the other way around. This document is the single source
of truth for styling decisions — if a screen doesn't match something here,
the screen is wrong, not this doc, unless you're deliberately amending it.

---

## 1. Design tokens

### 1.1 Color

Base palette, as Tailwind CSS variables (`globals.css` `:root` / `.dark`):

| Token | Light value | Dark value | Use |
|---|---|---|---|
| `--background` | `#FAF8FF` | `#0B1614` | App background |
| `--surface` | `#FFFFFF` | `#101E1B` | Card / panel surfaces |
| `--surface-muted` | `#F2F3FF` | `#16241F` | Secondary surfaces, input fills |
| `--foreground` | `#131B2E` | `#EAF3F1` | Primary text |
| `--muted-foreground` | `#707975` | `#9AB0AC` | Secondary/supporting text |
| `--border` | `#EAEDFF` | `#20302C` | Default borders |
| `--primary` | `#00362A` | `#7FE3BB` | Primary CTA (buttons, active nav, links) |
| `--primary-foreground` | `#FFFFFF` | `#06120E` | Text/icons on primary |
| `--wordmark` | `#006A65` | `#4FC4B4` | The MUTAGENIC umbrella wordmark only |
| `--accent-mutagenic` | `#006A65` | `#4FC4B4` | Umbrella accent — entry surfaces (onboarding, auth) before a flow is chosen |
| `--accent-gmo` | `#006C4A` | `#3DBA86` | GMO Check / food flow |
| `--accent-fluoride` | `#2E7BC4` | `#4C8DE0` | Fluoride Scan / oral care flow |
| `--gcheck-accent` | `#006C4A` | `#6FE0B4` | Active nav, meter fill, inline links |
| `--gcheck-mint` | `#82F5C1` | `#2F6F57` | Success mint — always translucent (25–60%) |
| `--gcheck-tint` | `#F2F3FF` | `#17202E` | Metric bar, inputs, thumbnail wells |
| `--brand-gradient-start` | `#DFF7F1` | — | Onboarding/auth gradient start (light only) |
| `--brand-gradient-end` | `#F0FBFF` | — | Onboarding/auth gradient end (light only) |

#### 1.1a Product palette — ink, brand, emerald, cyan, mint

⚠️ **This section was missing while the code was already using these colours.**
The visual redesign shipped a slate-navy / cyan palette as ~155 literal hex
values across 12 screens. Because a hex in a className cannot be overridden by a
`dark:` utility, those screens stayed light while `/history` and `/settings` went
dark, and §6's "no raw hex in component code" could never pass. The values below
were adopted *from* the shipped UI, so adopting them is a zero-visual-change
refactor, not a repaint.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ink-strong` | `#111C2D` | `#F2F7FC` | Headings on entry/auth screens |
| `--ink` | `#182234` | `#E6EDF5` | Primary body + heading text |
| `--ink-secondary` | `#293446` | `#CBD7E4` | Emphasised secondary text |
| `--ink-muted` | `#647184` | `#9AABBE` | Supporting / helper text |
| `--ink-subtle` | `#82909A` | `#7D8EA3` | Least-important metadata |
| `--surface-subtle` … `--surface-tinted` | `#F4F7FA` … `#E7EDF2` | dark equivalents | Grey surface ramp |
| `--brand-strong` / `--brand` / `--brand-deep` / `--brand-ink` | `#0D52D6` / `#1454D4` / `#174CA5` / `#164AAF` | light blues | Primary CTA, links, active nav |
| `--brand-soft` … `--brand-wash-3` | `#E7EEFF` … `#E1EAFF` | dark equivalents | Blue washes / tinted panels |
| `--emerald-strong` … `--emerald-bright` | `#006C45` … `#008D7B` | light greens | Success, verified states |
| `--emerald-tint` … `--emerald-on-brand` | `#D6F3E7` … `#9BF0C0` | dark equivalents | Green washes and hairlines |
| `--cyan` / `--cyan-mid` / `--cyan-soft` | `#00BFD6` / `#09A9D0` / `#75C9D8` | light cyans | Analyze / progress family |
| `--cyan-wash` … `--cyan-ink` | `#E5F7FB` … `#073B48` | dark equivalents | Cyan washes + deep cyan text |
| `--mint-hairline` / `--mint` / `--mint-start` | `#B9ECEB` / `#D9F7F6` / `#DCF8F5` | dark equivalents | Guest / nav surfaces |
| `--rose` / `--rose-wash` / `--rose-wash-2` | `#DF374C` / `#FFF0F1` / `#FFF4F4` | dark equivalents | Destructive on the product palette |
| `--amber` | `#DF9B00` | `#E8B04A` | Warnings on the product palette |

**Two rules that keep this from drifting again:**

1. **Every one of these is exact.** `text-ink` resolves to `#182234`, so
   replacing `text-[#182234]` with it is a zero-diff change. Do not "snap a hex
   to the nearest token" — that silently recolours approved work. If a new colour
   is genuinely needed, add a token for it; don't round it onto an existing one.
2. **The core tokens are not re-pointed at the product palette.**
   `--success` / `--warning` / `--destructive` / `--confidence-*` drive
   `ResultBadge` and `ConfidenceBadge`. Recolouring those would break the
   two-badge constraint §2 is built to protect.

**The only legal raw hex values in `src/`:**
- third-party brand marks in `ProviderGlyph.tsx` (Google ×4, Facebook ×1) — a
  brand button must use that company's actual colour
- `themeColor` in `src/app/layout.tsx` — Next resolves it at build time into a
  `<meta>` tag, where no CSS variable can reach

`npm run palette:check` fails the build if anything else appears.

Category accents — used consistently everywhere that category appears
(icons, tags, card left-border, chart fills). This mapping is a wayfinding
system; never swap it per-screen:

| Token | Value | Use |
|---|---|---|
| `--accent-gmo` | `#1F9D6B` (green) | GMO / food category |
| `--accent-gmo-soft` | `#E4F7EE` | GMO category tinted backgrounds |
| `--accent-fluoride` | `#2E7BC4` (blue) | Fluoride / oral-care category |
| `--accent-fluoride-soft` | `#E6F1FB` | Fluoride category tinted backgrounds |

Semantic tiers — these already exist in the codebase (`success` /
`warning` / `destructive`) and back `ResultBadge`. Do not introduce new
tier colors; reuse these everywhere a Low/Medium/High tier appears outside
the verdict badge itself (e.g., History status pills):

| Token | Value | Meaning |
|---|---|---|
| `--success` | `#1F9D6B` | Low / Fluoride-Free / Approved |
| `--warning` | `#C98A1F` | Medium |
| `--destructive` | `#C7473F` | High |
| `--muted` | `#8A9490` | None / no data |

Confidence tier colors (already implemented in `ConfidenceBadge.tsx` as
violet/sky/slate) — restyle to this palette rather than introducing a
third unrelated hue system:

| Tier | Value |
|---|---|
| High confidence | `#2E7BC4` (reuse fluoride blue — confidence is a "trust" signal, blue reads as trustworthy without competing against the green/amber/red result tiers) |
| Medium confidence | `#5B9DBF` (lighter tint of the same hue) |
| Low confidence | `#8A9490` (neutral gray — deliberately unsaturated so it never reads as "good") |

**Rule:** result tiers use green/amber/red. Confidence tiers use
blue/gray. These two hue families must never overlap — that overlap is
what would make the two badges blur together, which is the exact failure
`06_AGENT_CONTEXT.md` §2 prohibits.

### 1.2 Typography

Font family: a clean geometric-humanist sans (Inter or the project's
existing shadcn default — do not introduce a second family).

| Token | Size / Line-height | Weight | Use |
|---|---|---|---|
| `display` | 28px / 34px | 700 | Onboarding headlines ("Solve Real World Product Questions") |
| `h1` | 22px / 28px | 700 | Screen titles ("Diagnostic Result", "Community Lab") |
| `h2` | 18px / 24px | 600 | Section headings ("Verification Findings") |
| `h3` | 15px / 20px | 600 | Card titles ("GMO & Food Purity") |
| `body` | 14px / 20px | 400 | Default body text |
| `body-strong` | 14px / 20px | 600 | Emphasized inline text |
| `label` | 13px / 16px | 500 | Form labels, tag text |
| `caption` | 12px / 16px | 400 | Supporting/secondary text, timestamps |
| `overline` | 11px / 14px, uppercase, tracked +0.04em | 600 | Eyebrow labels ("CLINICAL ORAL CARE", "PPM METRIC") |

Rules:
- No more than 3 weights in active use anywhere on one screen (400/500/700
  is the standard trio; 600 only for the h2/h3/label tier above).
- Body text never drops below 14px — the reference screens' small
  supporting copy (helper text under form fields) is already close to the
  floor; don't go smaller.
- Line-height is always ≥1.3× the font size for anything more than one
  line of body copy.

### 1.3 Spacing

4px base unit. Named scale, used instead of arbitrary pixel values
anywhere in Tailwind classes:

| Token | Value |
|---|---|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-5` | 20px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-10` | 40px |
| `space-12` | 48px |
| `space-16` | 64px |

Component-level defaults:

| Context | Spacing |
|---|---|
| Screen horizontal margin | `space-5` (20px) mobile, `space-8` desktop |
| Card internal padding | `space-4` to `space-5` |
| Gap between stacked cards | `space-4` |
| Gap between a heading and its content | `space-2` |
| Gap between unrelated sections | `space-8` |
| Button internal padding | `space-3` vertical, `space-5` horizontal |
| Form field gap | `space-4` |

### 1.4 Radius

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 8px | Inputs, small tags |
| `radius-md` | 12px | Buttons (non-pill), small cards |
| `radius-lg` | 16px | Standard cards, modals/sheets |
| `radius-xl` | 20px | Feature cards (onboarding illustration cards, home hub category cards) |
| `radius-full` | 9999px | Pill buttons, badges, avatar |

Matches the "8–12px for functional chrome, larger for feature surfaces"
pattern already visible in the reference screens — inputs and nav are
tighter, the big colorful category cards are looser.

### 1.5 Elevation

Restrained throughout — never a "giant shadow."

| Token | Value | Use |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgba(15,27,25,0.04)` | Buttons, badges |
| `shadow-sm` | `0 2px 8px rgba(15,27,25,0.06)` | Cards at rest |
| `shadow-md` | `0 8px 24px rgba(15,27,25,0.10)` | Modals, sheets, dropdowns |

No shadow ever exceeds `shadow-md`. If a component feels like it needs
more depth than that, use a border instead (`--border` at 1px), not a
bigger shadow.

---

## 2. Hierarchy

The rule that governs every screen: **there is exactly one primary action,
and it is the most visually dominant element after the content itself.**

Precedence, strongest to weakest:
1. **Primary CTA button** — solid `--primary` fill, `radius-full`,
   `body-strong` weight. One per screen, ever. ("Next", "Get Started",
   "Register", "Scan Oral Care", "Submit Product".)
2. **Screen title (`h1`)** — top of screen, always present, never
   competing with the CTA for attention (different zone of the screen).
3. **Result badge** on the verdict screen is a special case: it is
   effectively co-primary with the CTA below it, because the result *is*
   the content the user came for. This is the one screen where two
   elements are allowed equal visual weight.
4. **Section headings (`h2`)** — divide content, never styled to compete
   with `h1`.
5. **Card titles (`h3`)** and **body text** — the bulk of the interface.
6. **Secondary/tertiary actions** — outline or ghost buttons, text links
   ("Skip", "Forgot Password?", "Continue as Guest") — visually quiet,
   never the same weight as the primary CTA even when placed nearby.
7. **Metadata** (`caption`, `overline`) — timestamps, tags, eyebrow labels.
   Lowest visual weight, always `--muted-foreground`.

Anti-pattern to avoid explicitly: don't let a secondary action (e.g.
"Skip") use the same color as the primary CTA at reduced opacity — that
reads as a second, weaker primary action rather than a genuinely
different tier. Secondary actions use `--foreground` or `--muted-foreground`
text, never a tinted version of `--primary`.

---

## 3. Components

Each component below must look identical everywhere it appears —
one definition, reused, restyled centrally, never forked per-screen.

### Buttons

| Variant | Style | Use |
|---|---|---|
| Primary | Solid `--primary`, white text, `radius-full`, `shadow-xs` | The one CTA per screen |
| Secondary | Outline, 1px `--border`, `--foreground` text, `radius-full` | Secondary actions ("Skip" as outline where it needs more presence) |
| Ghost | No border/fill, `--foreground` text | Tertiary actions, icon buttons |
| Destructive | Solid `--destructive`, white text | Admin reject, delete actions only |

States: default → hover (`brightness-95` on solid, `bg-surface-muted` on
ghost/outline) → active (`brightness-90`) → focus-visible (`ring-2
ring-primary/50`, 2px offset) → disabled (`opacity-50`, no hover/active
transform, `cursor-not-allowed`).

Minimum touch target: 44×44px, even when the visible label is smaller —
pad hit area, not just visible box.

### Inputs & Selects

`radius-sm`, 1px `--border`, `--surface` fill, `space-3` vertical padding.
Focus: border becomes `--primary`, plus a soft `ring-2 ring-primary/20`.
Error state: border becomes `--destructive`, helper text below in
`--destructive` at `caption` size — never just a color change with no
text explanation.

### Cards

`radius-lg` default, `radius-xl` for feature/category cards, `shadow-sm`,
1px `--border` at low opacity rather than a strong shadow doing the
separation work. **Use cards only for genuine grouping** — the original
design brief's own caution against "turning every section into a floating
card" applies directly here. A single stat or a form section header does
not need its own card.

### Badges

**`ResultBadge` and `ConfidenceBadge` are structurally different shapes,
by design, and this must never change:**

- `ResultBadge`: `radius-full` pill, colored dot + label, uses
  green/amber/red/gray tier colors from §1.1.
- `ConfidenceBadge`: `radius-md` rectangular chip (not a pill), 3-bar
  signal meter + label, uses blue/gray tier colors from §1.1, expands on
  tap to show `confidence.factors`.

If these two ever end up the same shape or overlapping hue family, that's
a regression, not a style choice — see `06_AGENT_CONTEXT.md` §2.

Standard status badges (History page: Pending/Approved/Rejected) reuse the
semantic tier colors (`warning`/`success`/`destructive`) in the
`ResultBadge` pill shape, since they're a different kind of status, not a
confidence signal.

### Tables (admin review queue)

Row height generous enough for a thumbnail + two lines of text
(minimum 64px). Column alignment: text left, numbers/counts right, status
badges centered. Zebra striping via `--surface-muted` on alternate rows
only if the table exceeds ~8 rows visible at once — otherwise a plain
list with dividers reads cleaner.

### Dropdowns / Modals / Sheets

`radius-lg`, `shadow-md`, `--surface` fill. Enter: fade + 4px translate-up,
150ms. Exit: fade only, 100ms (exit should always feel faster than
enter). Backdrop: `--foreground` at 40% opacity, no blur (avoid glass
effects per the "excessive glassmorphism" guidance).

### Tabs

Underline style (not pill/segmented) for the History page's
Submissions/Scans-equivalent tabs — active tab: `--primary` underline +
`--foreground` text; inactive: `--muted-foreground` text, no underline.
Transition: underline slides, 200ms.

### Tooltips

`--foreground` fill, `--background` text (inverted from body text — a
tooltip should read as a distinct "overlay" surface), `radius-sm`,
appears after 400ms hover delay, disappears immediately on mouse-leave.

### Alerts / Inline notices

Left border (3px, tier color) + tinted background at 8% opacity of that
tier color + icon + text. Used for the "Verification Findings" flags and
form validation summaries. Never a full-bleed colored banner — keep it
contained to the relevant section.

### Navigation

Bottom tab bar (mobile, public-facing). Two tab sets, chosen by route:

- **Hub** — `/guest-dashboard` and `/settings`: **Home / History / Settings**.
- **Flow** — every other in-app screen: **Home / Scan / History / Learn**.

The active tab is the one whose route matches, and it is the tab rendered with
the **big, popping-out circular icon**. That treatment is the active-state
marker, not a fixed decoration on Scan — it used to be hardcoded onto Scan, so
Scan read as selected on every page. Active in `--gcheck-accent` (white on the
circle), inactive in `--gcheck-body`.

The bar is visible on **every** in-app screen, the live scan viewfinder
included: a capture step must never remove the navigation that owns the tab the
user just tapped. It is hidden only on the pre-auth entry screens
(`/onboarding`, `/register`, `/login`, `/auth/*`) and `/admin`, which has its own
navigation. `src/components/layout/BottomNav.test.tsx` pins the tab sets, the
active state and the visibility rule.

The account panel is a right-hand sheet opened from the avatar, and it is where
sign-out lives — there is no side drawer.

### Pagination (admin queue)

Numbered, with prev/next, current page in `--primary` solid pill, others
as ghost buttons. No infinite scroll on the admin queue — reviewers need
stable, referenceable page state.

### Empty states

Icon (outline style, `--muted-foreground`, ~48px) + `h3` message +
`caption` supporting text + one optional action button. Never just blank
space with no explanation — every empty state in this app (no
submissions yet, no scan history, no search results) follows this exact
structure.

### Loading states

Never a bare spinner with no context. Minimum: a label describing what's
happening ("Analyzing product…"). For the multi-step OCR/engine pipeline,
use the reference screens' checklist pattern (§4 below) — each real
pipeline stage gets its own line with a checkmark/spinner/pending state,
driven by actual progress events, not a fake timer.

---

## 4. Interactions

| Interaction | Duration | Easing |
|---|---|---|
| Button hover/press feedback | 100ms | ease-out |
| Modal/sheet enter | 200ms | ease-out |
| Modal/sheet exit | 150ms | ease-in |
| Dropdown open | 150ms | ease-out |
| Tab underline slide | 200ms | ease-in-out |
| ConfidenceBadge expand/collapse | 200ms | ease-in-out, height auto via grid-template-rows trick or Radix Collapsible, not a fixed max-height guess |
| Capture-guide corner brackets (pulse when no label detected) | 1200ms loop | ease-in-out |
| Toast/success feedback appear | 200ms | ease-out, then auto-dismiss after 4s |
| Page-to-page navigation | No custom transition — rely on Next.js default; do not add a global page-transition wrapper, it adds latency perception for no benefit on a scan-speed-sensitive flow |

Rule: nothing in this app animates longer than 250ms except the capture
corner-bracket idle pulse. This is a utility app used repeatedly, often
one-handed, often outdoors — motion should never be in the way of task
completion.

---

## 5. Responsiveness

### 5.1 The app is mobile-only (1025px gate)

MUTAGENIC is a phone/tablet app. It is **not** a wide layout that happens to also
work on a phone: the 402pt column is the whole design, and above a tablet there
is nothing to show.

So above **1024px** the app shell is hidden and replaced by a full-viewport
"Switch to a mobile device" notice (`src/components/layout/MobileOnlyGate.tsx`,
rule in `globals.css`).

Why 1024 and not Tailwind's `md` (768) or `lg` (1024):

- **iPads are supported devices.** Every iPad in portrait is at or under 1024
  (the 12.9" Pro is exactly 1024). A `md` boundary would lock out the very
  tablets we support; a `lg` boundary (`min-width: 1024px`) would lock out only
  the 12.9" Pro. The rule is therefore `min-width: 1025px`, which puts the line
  between the widest iPad (1024) and the smallest common laptop (1280).
- **`/admin` is exempt.** Reviewing a submission queue is a desk task, and the
  console predates this rule. The admin layout carries a `data-desktop-ok`
  marker and `:has()` stands the gate down for that subtree.
- **It is pure CSS, deliberately.** A JS viewport check would paint the desktop
  shell for a frame before the notice appeared, and would blank the page until
  hydration. The gate is server-rendered and shown or hidden by the media query
  alone. If `:has()` is unsupported the selectors are dropped and a desktop
  falls back to showing the app rather than to a dead end.

Any screen that sizes itself for desktop conflicts with this rule. `/history`
and `/settings` used to open at `max-w-2xl` / `max-w-lg` through `PageContainer`
and are now capped at the app's 402pt column like every other screen.

The Playwright suite runs at a 402×874 viewport for the same reason — a desktop
viewport would test a screen no user is meant to reach.

### 5.2 Breakpoints inside the app

| Breakpoint | Width | Primary audience |
|---|---|---|
| Base (mobile) | <640px | Public scan flow — the primary target, design mobile-first |
| `sm` | ≥640px | Larger phones, no structural change needed |
| `md` | ≥768px | Tablets — admin queue gains a two-column layout |
| `lg`–`xl` | ≥1024px / ≥1280px | Admin console only — gate stops everyone else at 1024 |

Rules:
- The public scan flow (capture, verdict, submission) is designed
  mobile-first and stays single-column at every breakpoint — this is a
  phone-camera task, there's no meaningful desktop version of it, and it
  should not be stretched into a wide layout just because the viewport
  allows it. Cap its max-width at the app's 402pt column and center it.
- The admin review queue is the one surface that should meaningfully
  restructure across breakpoints — mobile gets a stacked card list
  (matching `SubmissionRow`'s current card treatment), `md`+ gets the
  full table layout, `xl` gets a persistent left nav instead of the
  hamburger/drawer pattern.
- Minimum touch target 44×44px on every interactive element at every
  breakpoint, not just mobile.
- Respect safe areas on notched devices: `viewport-fit=cover` plus
  `env(safe-area-inset-*)` padding on any fixed header/footer/bottom nav,
  consistent with the PWA requirements already in
  `03_FRONTEND_ARCHITECTURE.md` §7.
- Do not simply scale desktop component sizes down for mobile — the
  capture screen, verdict gauge, and bottom nav are mobile-native
  patterns first; the admin table is the one screen designed desktop-first
  and adapted down.

---

## 6. Visual QA checklist

Run this before considering any redesigned screen done:

**Tokens**
- [ ] No raw hex values in component code — everything references a
      token from §1
- [ ] No arbitrary spacing values (`mt-[13px]`) — everything uses the
      `space-*` scale
- [ ] No third color hue introduced beyond: primary blue, GMO green,
      fluoride blue, semantic success/warning/destructive/muted,
      confidence blue/gray
- [ ] No raw hex in any component that a `dark:` variant exists for. A literal
      hex in a `className` wins over every `dark:` utility, which is why the
      redesign pass left ten screens light while the rest of the app went dark.
      `npm run palette:check` enforces this — the only exemptions are the five
      brand marks in `ProviderGlyph.tsx` and the build-time `themeColor` meta.
- [ ] New colours are added as **tokens at their exact intended value**, never
      mapped onto the nearest existing token — see §1.1a rule 1
- [ ] **Tailwind's built-in palette is just as opaque as a raw hex.** `bg-white`
      has no `dark:` variant, so a white card stays white while its text inverts.
      Surfaces use `bg-surface`; text on a saturated fill uses
      `text-ink-on-brand`. `npm run palette:check` catches these too — in all
      three syntactic forms (`bg-white`, `!bg-white`, `[&_button]:bg-white`), each
      of which has broken dark mode here at least once.
- [ ] **Contrast-audit both themes in the browser, not in the source.** Grep finds
      nothing wrong with `[&_button]:bg-white`; the rendered page tells you
      immediately. There is no substitute for this — 9 dashboard elements sat at
      1.1:1 and the `/login` OAuth buttons at **1.0:1** while every static check
      passed.
- [ ] **Audit icon-only controls too.** An audit that walks leaf text nodes
      reports the OAuth buttons clean, because their label is an `aria-label` and
      the visible pixels are SVG. Audit every element that paints its own
      background and has visible content, text *or* icon.

**Contrast**
- [ ] All body text ≥4.5:1 contrast against its background
- [ ] All large text (`h1`/`h2`/`display`) ≥3:1
- [ ] Badge text remains readable at both light and dark tint intensities
      — check the tinted-background badges specifically, they're the
      easiest place to accidentally fail contrast

**Structural non-negotiables**
- [ ] `ResultBadge` and `ConfidenceBadge` are visually distinguishable by
      shape alone, with color removed (test this by viewing in
      grayscale/simulated color-blindness) — this is the single most
      important check in this whole list
- [ ] `ConstraintNotice` renders on every verdict, is not dismissible, and
      is not visually de-emphasized to the point of being skippable
- [ ] No verdict screen displays a single merged percentage/score in
      place of the two separate badges

**Consistency**
- [ ] Every screen's primary CTA uses the same button component, not a
      one-off styled button
- [ ] Category color mapping (green=GMO, blue=fluoride) is consistent
      across every screen it appears on
- [ ] No screen introduces a new card radius, shadow depth, or spacing
      rhythm not defined in §1

**Responsiveness**
- [ ] Every redesigned screen reviewed at 375px, 768px, 1024px, 1440px
- [ ] No horizontal scroll anywhere except intentionally (e.g. a wide
      admin table inside its own `overflow-x-auto` container)
- [ ] Bottom nav / fixed elements respect safe-area insets on a notched
      device simulation

**Accessibility**
- [ ] Every interactive element reachable and operable via keyboard alone
- [ ] Focus ring visible and never suppressed with `outline-none` without
      a replacement focus style
- [ ] All images/icons conveying meaning have accessible text
      (`aria-label` or visually-hidden text), not color/icon alone
- [ ] Form errors are announced (`aria-live` or associated via
      `aria-describedby`), not just a border color change

**Regression**
- [ ] `npx vitest run` — all tests pass after the visual pass
- [ ] Manually re-run one full scan → verdict → low-confidence submission
      → admin approve cycle after the redesign, to confirm no interaction
      broke under new markup
- [ ] Touch targets: every interactive element ≥44×44px. The redesign pass
      previously overrode the `Button` primitive downward (15px–40px) on ~15
      screens; `h-11` / `size-11` is the floor, not the default `h-10`/`size-10`
      a `size="sm"` button carries
- [ ] No `localStorage`/`sessionStorage` read in a `useState` initializer —
      that runs during SSR and causes a guaranteed hydration mismatch. Read
      through `useSyncExternalStore` with a referentially stable snapshot
- [ ] Screen-reader check on `ResultGauge`: it must NOT be `role="img"` with an
      `aria-label`, which hides the centre readout (the actual ppm / crop count)
      from assistive tech
