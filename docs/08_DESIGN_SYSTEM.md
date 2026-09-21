# Design System — Fluoroscan (Trimetric-SFH)

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
| `--background` | `#F5FBFA` | `#0B1614` | App background |
| `--surface` | `#FFFFFF` | `#101E1B` | Card / panel surfaces |
| `--surface-muted` | `#EEF6F5` | `#16241F` | Secondary surfaces, input fills |
| `--foreground` | `#0F1B19` | `#EAF3F1` | Primary text |
| `--muted-foreground` | `#5B6B68` | `#9AB0AC` | Secondary/supporting text |
| `--border` | `#DCEAE8` | `#20302C` | Default borders |
| `--primary` | `#1E5AA8` | `#4C8DE0` | Primary CTA (buttons, active nav, links) |
| `--primary-foreground` | `#FFFFFF` | `#0B1614` | Text/icons on primary |
| `--brand-gradient-start` | `#DFF7F1` | — | Onboarding/auth gradient start (light only) |
| `--brand-gradient-end` | `#F0FBFF` | — | Onboarding/auth gradient end (light only) |

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

Bottom tab bar (mobile, public-facing): 3 items max (Home / History /
Settings), icon + label, active item in `--primary`, inactive in
`--muted-foreground`. Side drawer (the "John Rita" profile panel):
`radius-lg` on the leading edge only, slides in from left, 250ms, with
the same backdrop treatment as modals.

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

Breakpoints (Tailwind defaults, used as-is):

| Breakpoint | Width | Primary audience |
|---|---|---|
| Base (mobile) | <640px | Public scan flow — this is the primary target, design mobile-first |
| `sm` | ≥640px | Larger phones, no structural change needed |
| `md` | ≥768px | Tablet — admin queue gains a two-column layout |
| `lg` | ≥1024px | Desktop — admin queue becomes the primary use case here |
| `xl` | ≥1280px | Wide desktop — admin queue gets a persistent side nav instead of a drawer |

Rules:
- The public scan flow (capture, verdict, submission) is designed
  mobile-first and stays single-column at every breakpoint — this is a
  phone-camera task, there's no meaningful desktop version of it, and it
  should not be stretched into a wide layout just because the viewport
  allows it. Cap its max-width (~480px) and center it on larger screens.
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
- [ ] `npx vitest run` — all 101 tests still pass after the visual pass
- [ ] Manually re-run one full scan → verdict → low-confidence submission
      → admin approve cycle after the redesign, to confirm no interaction
      broke under new markup
