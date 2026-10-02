# MUTAGENIC — User Guide

> **Audience:** anyone using, demoing, or reviewing the app — and anyone who needs
> to explain *how* a verdict is produced. This is the plain-language companion to
> the engineering docs (`01_TECHNICAL_SPECIFICATION.md`, `GMO_Build_Guide.md`,
> `Fluoride_Build_Guide.md`, `03_FRONTEND_ARCHITECTURE.md`). Where those specify,
> this explains; where this and the code disagree, the code and the specs win.

---

## 1. What the app is

**MUTAGENIC** is a camera-first mobile web app (PWA). You photograph a product
label and it returns **one plain-language verdict** plus a **separate confidence
rating**:

| Product type | Flow | Verdict language |
|---|---|---|
| Packaged food | **GMO Check** (green) | Low / Medium / High GMO likelihood |
| Oral care (toothpaste, mouthwash, gel) | **Fluoride Scan** (blue) | Fluoride-Free / Low / Standard / High fluoride |

MUTAGENIC is the umbrella brand. "GMO Check" and "Fluoride Scan" are its two
flows, and they never run on the same product — the category you pick decides
which single rules engine scores the label.

Two ideas run through the whole app and are worth stating up front:

1. **Result and confidence are different things and are always shown apart.**
   "Low GMO likelihood, High confidence" and "Low GMO likelihood, Low confidence"
   look clearly different because they *are* different. Confidence is a rating of
   the *read*, not of the product.
2. **A photo cannot prove anything.** Every verdict carries a non-dismissible
   constraint notice. For food it says a photo cannot confirm GMO content; for
   oral care it says the reading is label information, not a measurement or
   medical advice.

### The app is mobile-only

The scan flow is camera-first, so the UI is built for phones and tablets. On a
screen wider than **1025px** the app replaces itself with a **"Switch to a mobile
device"** notice (pure CSS — no flash of the wrong layout). The boundary sits
above the widest iPad portrait (1024px) and below the smallest common laptop
(1280px). `/admin` is exempt: reviewing a submission queue is a desk task.

---

## 2. Screen map

| Route | Screen | Who sees it |
|---|---|---|
| `/` | Redirect → `/onboarding` | everyone |
| `/onboarding` | 3-slide carousel (umbrella brand) | first-time visitors |
| `/register` | Sign up (Google / Facebook / Apple / email) + "Continue as guest" | new users |
| `/login` | Sign in (same four options) | members + admins |
| `/guest-dashboard` | **Hub / Home** — pick a flow | everyone |
| `/gmo` | **GMO Check** home — hero, metrics, catalogue search | everyone |
| `/scan` | **Scan flow** (front → back → review → analyzing → result) | everyone |
| `/history` | History — "Verified" (saved scans) + "Contributions" | signed-in |
| `/learn` | "Reading a result" explainer | everyone |
| `/settings` | Account, default scan type, sign out | everyone |
| `/auth/forgot` | Request a password reset | members + admins |
| `/auth/reset-password` | Choose a new password | from a reset link |
| `/auth/callback` | OAuth handshake (not a visual screen) | OAuth users |
| `/admin` | Reviewer queue | admins |
| `/admin/admins` | Provision reviewer accounts | superadmins |

### Bottom navigation

Four tabs, one set for everyone: **Home · Scan · History · Learn**, with **Scan**
raised into a mint-green circle. The bar hides itself on the entry screens
(`/onboarding`, `/register`, `/login`, `/auth/*`) and on `/admin` (which has its
own navigation), and it steps aside only while the live camera viewfinder or the
analyzing screen is on top — result screens keep it.

---

## 3. Getting started

### 3.1 Onboarding — `/onboarding`

Three slides, each with one illustration, a headline, a short description, and a
small "proof" block:

1. **Welcome to Mutagenic** — what the app is.
2. **Solve Real World Product Questions** — the two flows at a glance.
3. **Understand What Labels Say** — the honesty framing (confidence + limits).

A progress dot row shows where you are; **Next** advances and on the last slide
becomes the hand-off to `/register`; **Skip** jumps straight there. The screen
speaks in the **umbrella accent** (teal `--accent-mutagenic`), never in a
category colour — you haven't chosen a flow yet.

> Layout note: the body scrolls inside a region while the **footer is pinned**, so
> Next/Skip are always reachable on short phones, and the illustration is
> `object-contain` in a fixed box so square and wide art are never cropped.

### 3.2 Register — `/register`

Creating an account is **optional** — the whole scan flow works anonymously.
From here you can sign up with Google, Facebook, or Apple, register with email +
password, or tap **Continue as guest**. All paths land on the hub
(`/guest-dashboard`). An email signup may ask you to confirm your address; the
confirmation link returns through `/auth/callback`.

The optional "User Name" field is stored as account metadata. Accounts created
here can only ever be ordinary `user` accounts — reviewer roles are provisioned
by a superadmin, never self-service.

### 3.3 Login — `/login`

The single sign-in screen — members and admins both use it. Google/Facebook/Apple
or email + password. Admin *authority* is decided later from the `profiles`
table, not by which screen you signed in from. If you were sent here from a
protected page, `next` returns you there after sign-in (and it is sanitised first,
so it can never be turned into an open redirect).

### 3.4 Forgot / reset password

`/auth/forgot` takes the email on a reviewer account and sends a reset link;
`/auth/reset-password` is where that link lands so you can set a new password
(minimum 6 characters).

---

## 4. The hub — `/guest-dashboard`

The app's front door and the point where its two flows meet. Top to bottom:

- **Greeting** — your name if you're signed in, otherwise a guest greeting.
- **Shield / streak card** — your recent scanning activity. Signed-in users get
  this from your account's scan history; guests get it from the scans kept on
  this device.
- **GMO Check card** (green) → opens the GMO flow's home, `/gmo`.
- **Fluoride Scan card** (blue) → opens `/scan?category=fluoride` directly
  (there is no separate fluoride home screen yet).
- **Trust metrics** — live counts from the catalogue and the published rulesets
  (products tracked, engine rules, crops tracked). None of these are hardcoded.
- **Recent checks** — your last few scans, with the same account/guest split.

Because the hub is where both flows are offered, nothing on it assumes a
category. This is the fix for the old behaviour where a guest was silently walked
into the food flow.

## 5. GMO Check home — `/gmo`

The food flow's own home. It holds:

- the **brand hero** with a prominent **Scan** button → `/scan?category=gmo`;
- the same **trust metrics**;
- a **catalogue lookup bar** — type a product or brand to search the verified
  catalogue *without* scanning. Results appear as a list below; while a search is
  active the hero is hidden so the matches land near the top;
- **recent checks**, signed-in or guest as above.

## 6. The scan flow — `/scan`

Deep-linkable with `?category=gmo` (food) or `?category=fluoride` (oral care).
With no parameter, the scan opens to whatever default you set in **Settings →
Diagnostic Preferences**. The flow is a small state machine:

### Step 1 — Capture the front

A live camera viewfinder with guides. Frame the **brand logo, product title and
any certifications** (food) or the **product name, brand and fluoride claims**
(oral care). You can also **upload a photo** from your gallery. Tapping the
shutter moves you to the back.

### Step 2 — Capture the back

Frame the **ingredients list and nutrition/active-ingredients panel**, flat and
well lit. For oral care the prompt is the active ingredients and fluoride
concentration. Capture or upload moves you to review.

### Step 3 — Review

Both photos are shown with a **Retake** on each, plus **Analyze labels**. If a
previous analysis failed (e.g. nothing readable), the reason appears here as an
alert rather than a dead-end.

### Step 4 — Analyzing

A staged progress screen: *reading the product name → reading the ingredients →
verifying levels / identifying → scoring*. It reflects real OCR progress, not a
timer. The tab bar is hidden here (a tab bar over a live scan is unusable).

### Step 5 — The result

There are two result paths, and which one you see depends only on whether the
**product name** matched the verified catalogue.

#### 5a. Verified result — `DiagnosticResult`

Shown when the front-label name matched a catalogue product. Canonical order:

1. A prominent **result title + real metric** (the gauge shows the engine's own
   value — a crop-family count for food, the ppm reading for oral care).
2. **Result badge** (the verdict).
3. **Confidence badge** — a deliberately different shape from the result badge,
   expandable to show the factors that produced the score.
4. A **product-verified card**, saying how it was matched. A name match below
   **0.8** similarity is labelled **"Tentative name match"** and does **not** get
   the green verified check — that is reserved for strong name matches, because
   "we probably have this product" is a weaker claim than "we have this product".
5. A **verified-result checklist**, **Save to My History**, and **View detailed
   breakdown** (the matched terms and why they matter).
6. The **constraint notice** — never dismissible.
7. **Scan again** / **Help us add** actions. A correction path is offered whenever
   confidence is **low**, including when a *stored* verdict came back
   low-confidence.

#### 5b. Unverified result — `UnverifiedScreen`

Shown when no catalogue match was found. It is careful about *why*, which matters:

- If the **front label was readable** but the product isn't in the catalogue:
  *"We couldn't find this product"* — with a **contribution** CTA and an optional
  manual catalogue search.
- If the **front label could not be read at all**: *"We couldn't read the front
  label — this is about the photo, not the product."* The catalogue was never
  actually searched, so blaming it would send you to re-check a database that may
  well contain the product.

Either way you can tap through to the **provisional result**, which is rendered by
the same result screen but framed as provisional. **Help us add this product**
opens the contribution screen.

#### 5c. Add a product

A pre-filled form (product name, brand, ingredients text, and the captured
photos) sits behind a short explanation. **Correct anything OCR misread**, then
submit. Photos are re-encoded client-side as JPEG (which also strips EXIF/GPS)
and uploaded to private storage; the submission is written with status
**pending**. Nothing enters the catalogue until a human approves it.

#### 5d. Thanks

Confirms the submission with a receipt reference, a thumbnail, and the product
name/brand. From here: **Scan another** or **Done** (back to the hub).

## 7. History — `/history`

Two tabs:

- **Verified** — the scans you chose to **Save to My History**. These live in the
  browser's on-device storage, so they are private to this device and survive
  reloads but not a cache clear.
- **Contributions** — the corrections you submitted, read from the server, each
  showing **Pending review / Approved / Rejected**.

> Known gap (being tracked): the **Verified** tab reads the on-device store while
> the hub's activity counts read the account's server-side `scans` table. For a
> signed-in user on multiple devices the two can disagree. See the architecture
> docs for the intended unification.

## 8. Learn — `/learn`

The umbrella explainer, "Reading a result", with three sections:

1. **How a check works** — photograph the front and the ingredients panel; the app
   reads the text, matches the catalogue and the rules engine, and returns one
   verdict with a separate confidence rating.
2. **What the result means** — food: how much GMO-linked signal the ingredient
   list carries; oral care: the listed fluoride compounds read against the ppm
   range for that product type. Confidence says how much to trust the read.
3. **What it can't tell you** — a photo cannot confirm GMO content; a missing term
   is not proof of absence; a fluoride estimate is read off the label, not
   measured. Not a laboratory answer, not medical advice.

There is no back arrow here: Learn is a tab destination, so the tab bar is the way
back.

## 9. Settings — `/settings`

- **Diagnostic Preferences → Default scan type** — what `/scan` opens to when no
  category is in the URL (Food / oral care). A local, per-device preference.
- **Account identity** — your email when signed in.
- **Reviewer access** — a link into `/admin` when your account has the role.
- **Sign out** — returns you to onboarding. Available whether or not you are
  signed in.

## 10. Admin — `/admin` and `/admin/admins`

Server-gated: no session goes to `/login`, and a non-admin is redirected home.
The role is read from the `profiles` table, never from client-visible metadata,
and the same check is repeated in every `/api/admin/*` handler and enforced again
by database row-level security.

- **`/admin` — Review queue.** Pending submissions, filterable by category and
  paginated. Expanding a row shows the photo through a short-lived signed URL and
  a **live recompute preview** from the corrected text. **Approve** calls the
  database function that writes the verified row and closes the submission in one
  transaction — the reviewer approves the *computed* verdict, never a hand-typed
  one. **Reject** closes it without publishing. A duplicate barcode is caught up
  front with a clear message rather than a raw error.
- **`/admin/admins` — Reviewer accounts** (superadmin only). Provision reviewer
  email + password accounts.

> Deployment note: admin accounts can require an authenticator (TOTP) via the
> `ADMIN_MFA_REQUIRED` environment variable. Leave it off until an authenticator
> is enrolled for **every** admin, or the first admin to sign in is locked out.

---

# Part II — How a verdict is computed

## 11. The pipeline at a glance

```
capture (camera / gallery)
   → prepare image (downscale + EXIF + deskew)          lib/ocr/image.ts
   → OCR in a Web Worker (Tesseract.js)                 lib/ocr/*
   → normalize text
   → identify product (trigram name search)             lib/identification
   → load published ruleset                             lib/config/lookupConfig.ts
   → route to ONE engine (gmoEngine | fluorideEngine)   lib/scan/pipeline.ts
   → EngineResult
   → verdict UI (result badge + confidence badge)
                         ↓ (low confidence / no match)
                    submission → admin queue → products
```

Everything except the two engine modules and their lookup tables is shared. The
engines are **pure, deterministic functions** — regex and arithmetic only, no LLM,
no `eval`. Lookup tables are **data** that a data team can correct without an app
redeploy.

## 12. What "confidence" means (and does not mean)

- **Result** = *what the label says* (the tier).
- **Confidence** = *how much to trust this read* (low / medium / high), built from
  a small set of counted facts: was the ingredient list complete, did we identify
  the product, how much of the extracted text did we recognize, was a
  concentration actually printed, and how reliable was the OCR itself.

Bands are the same in both engines: **4–5 → High**, **2–3 → Medium**, **0–1 →
Low**. The confidence factors are shown to the user, one line each, so the rating
is never a bare number.

## 13. GMO Check — how the food verdict is computed

Source of truth: `docs/GMO_Build_Guide.md`; implementation `src/engines/gmoEngine.ts`
driven by the published GMO ruleset.

### Step 1 — Is there a certification?

The engine first searches **both the ingredient panel and the front label** for a
certification term (e.g. a certified-organic / non-GMO statement). A certification
is stronger evidence than any ingredient match, so if one is found the engine
**short-circuits**:

- **Verdict → Low GMO likelihood.**
- **Confidence → High (5)**, or **Medium (3)** if the OCR mean confidence for the
  scan was below **0.6**. A seal "found" in barely-readable text may be a misread,
  so a poor read cannot report High confidence.

The front label is searched because real seals are printed next to the brand name,
never inside the ingredient list.

### Step 2 — Classify each ingredient

The ingredient text is normalized (split on commas/lines, lowercased, cleaned)
into tokens. Each token is classified against the ruleset:

- **Explicit** — the token contains a known alias for a GMO-linked crop family
  (e.g. soy, corn, canola). One token can name **more than one** family:
  "soybean and/or canola oil" is two. All matches are collected.
- **Ambiguous** — an unspecified "vegetable [something]", or a listed ambiguous
  derivative. The label doesn't say which crop it came from.
- **Low-risk** — a token on the low-risk list.
- **Unknown** — none of the above.

### Step 3 — Verdict from the crop-family count (N)

**N** = the number of **distinct** crop families found:

| N | Verdict |
|---|---|
| 0 | **Low GMO likelihood** |
| 1 | **Medium GMO likelihood** |
| 2 or more | **High GMO likelihood** |

### Step 4 — Confidence

| Factor | Points |
|---|---|
| Ingredient list complete (not truncated) | **+2** |
| Product identified by strong name match (similarity ≥ 0.8) or barcode | **+2** |
| Product identified by tentative name match (0.4–0.79) | **+1** |
| ≥ 80% of extracted tokens recognized against the ruleset | **+1** |
| Certification statement clearly readable (non-truncated read) | **+1** |
| Ambiguous derivatives matched with **no** explicit crop anywhere | **−1** (once) |
| OCR mean confidence below 0.6 | **−1** (once) |

Totals → band (4–5 High, 2–3 Medium, 0–1 Low). Note the ambiguous and OCR
penalties apply **once per product**, not once per matched term.

### Step 5 — Guidance

A short, product-specific sentence is built from what was actually found: how many
crop families and which, which terms produced them, what couldn't be traced (and
why), and a "confirm against the packaging" note when confidence is low.

## 14. Fluoride Scan — how the oral-care verdict is computed

Source of truth: `docs/Fluoride_Build_Guide.md`; implementation
`src/engines/fluorideEngine.ts` driven by the published fluoride ruleset. The
fluoride secret is that it searches **both panels**: ppm claims and "fluoride
free" badges are frequently printed on the front.

### Step 1 — Route to a product subcategory

The ppm thresholds differ by product type (toothpaste/gel vs mouthwash vs …). The
subcategory is resolved in order:

1. A **validated subcategory** from the catalogue product, if this scan matched
   one;
2. **Keyword detection** over the front and back text (the keyword lists live in
   the ruleset);
3. Otherwise fall back to the larger **toothpaste/gel** table and mark the guess.

A **guessed** subcategory caps confidence at Medium — a guess must never read as
High.

### Step 2 — Find the fluoride compound and its concentration

For each compound row in the ruleset (in label order), the engine searches the
text, then looks just after the match (a ~60-character window) for a
concentration:

- **`… ppm`** printed directly → use that number. (Strongest.)
- **`… %`** → convert to ppm using the compound's multiplier, or ×10,000 when the
  text specifies a **fluoride ion** percentage; the result is rounded up. E.g.
  "0.243% sodium fluoride" becomes its ppm figure.
- **No number present** → fall back to that compound's **default ppm**, and flag
  that the reading came from a default (this withholds High confidence).

The two panels are matched independently, then the **back (ingredient) panel wins
when it produced a real reading** — the ingredient list is authoritative — and the
front is used only when the back produced nothing quantified.

**Last resort:** if no *named* compound was found but the pack simply states a
fluoride ppm — "Fluoride Toothpaste 1450 ppm", "1450 ppm fluoride" — the engine
reads that **direct ppm claim**. It is anchored to the word "fluoride" with a
bounded, digit-free window so an unrelated "500 ppm preservative" elsewhere on the
panel is never mistaken for the product's fluoride level.

### Step 3 — Special cases

- **No recognizable compound and no fluoride-free claim** → **"No Data"** at Low
  confidence. (Absence of a compound is *not* evidence the product is
  fluoride-free.)
- **An explicit fluoride-free claim and no active compound** → **Fluoride-Free**
  at High confidence (Medium if the subcategory was guessed or OCR was poor).

### Step 4 — Verdict from ppm

The engine finds the row whose **ppm range** contains the reading, in that
subcategory's table, and takes the row's verdict text. The tier is derived from
the verdict:

| Verdict text | Tier shown |
|---|---|
| contains "fluoride-free" | **Fluoride-Free** |
| starts with "Low" | **Low** |
| starts with "Standard" | **Standard / Medium** |
| otherwise | **High** |

### Step 5 — Confidence

| Factor | Points |
|---|---|
| Ingredient list complete (not truncated) | **+2** |
| Product identified by **barcode** match | **+2** |
| Product identified by name match only | **0** (recorded, no points) |
| A fluoride compound was recognized | **+1** |
| A concentration number was printed next to the compound | **+1** |
| OCR mean confidence below 0.6 | **−1** (once) |

Then two hard caps:

- A **default-ppm fallback** (no number printed) is capped at **Medium (3)**.
- A **guessed subcategory** is capped the same way.

So High confidence requires a routed subcategory *and* a printed concentration —
plus a clean read.

### Step 6 — Guidance

The guidance sentence comes from the matched ppm-range row in the ruleset, so it
describes what *this* reading means for *this* product type. The engine is the
single source of truth for the displayed number: the result gauge reads the value
the engine actually classified on rather than re-parsing the label text (otherwise
the ring could headline one ppm while the tier came from another).

## 15. Stored verdicts vs the rules engine

If the scan's product name matched the verified catalogue, the **stored row is the
source of truth** and the rules engine is skipped entirely. The stored verdict is
returned, with confidence preserved for a strong match (≥ 0.8) and capped at
Medium for a tentative one. Every stored verdict records which ruleset version
produced it, so rows scored under an older table can be found and recomputed.

## 16. How OCR works — from scanning to the result on screen

Source: `src/lib/ocr/*`, `src/lib/identification/productIdentification.ts`,
`src/lib/scan/pipeline.ts`.

### 16.1 Capture

The camera view (`CameraView`) grabs the current video frame as a JPEG, or a
gallery file is used. Front and back are captured as two separate images.

### 16.2 Prepare the image — this is where most accuracy comes from

`prepareBlobForOcr` (in `lib/ocr/image.ts`) does three things before recognition:

1. **Decode and honour EXIF orientation.** Gallery photos can be stored sideways.
   The browser usually applies the orientation while decoding, but some engines
   ignore it, and a sideways label reads as noise. The decoder detects which case
   it is (by comparing the decode against the stored JPEG frame dimensions) and
   only rotates when it must — never double-rotating.
2. **Downscale** to a **1600px long edge**, re-encoded as JPEG. Never upscales. The
   canvas trip also bakes the orientation and strips EXIF.
3. **Deskew.** Tilt, not resolution, is what destroys OCR — the same label read
   **0 characters at −20°** and 69 clean characters at 0°. The engine measures the
   tilt on a small 400px grayscale buffer (over ±40°, 1° steps) and rotates the
   label level on a white background (white, because Tesseract treats transparency
   as unpredictable ink).

> This preparation is **OCR-only**. It deliberately does not touch the photo that
> becomes submission evidence — silently rotating someone's photo before attaching
> it to a moderation decision is not a quiet transformation to make.

### 16.3 Recognize — Tesseract.js in a Web Worker

OCR runs in a dedicated **module Web Worker** (`lib/ocr/ocr.worker.ts`) so the UI
never freezes. The worker owns one Tesseract worker, reused across scans, and
streams **real progress** back to the analyzing screen.

- **Assets are self-hosted** under `/vendor/tesseract` (worker script, WASM core,
  and the English language data), so nothing hits a third-party origin and the
  content-security policy stays tight. They are fetched/installed by
  `npm run ocr:assets` and are **gitignored** — see the deployment guide.
- The English language pack is loaded **lazily**, not in the initial bundle.
- A **45-second timeout** aborts a pathological run and returns a friendly error
  instead of hanging on "analyzing" forever.

Each recognition returns:

- **`text`** — the recognized label text.
- **`meanConfidence`** — the mean of the per-block confidences, normalized 0–1.
  This is what feeds the engines' confidence scoring (0.6 is the penalty line).
- **`isTruncated`** — true when a recognized text box runs to the very edge of the
  image, i.e. the label was cut off in frame (geometry from Tesseract's output,
  not a string heuristic).
- **`blocks`** — the text blocks and their boxes, used for the debug breakdown.

### 16.4 Identify the product (from the front label)

The identification step reads the **front** panel only:

1. The front OCR text is turned into **candidate name strings** — each meaningful
   line, adjacent line pairs, and the compacted whole text.
2. Each candidate is sent to the catalogue's fuzzy match
   (`search_products_by_name`, trigram similarity, threshold **0.4**, scoped to
   the chosen category).
3. Because similarity alone matches any shared word — "Toothpaste 50ml" scored
   0.688 against "GUM Dental Paste Toothpaste" — a second gate requires the
   candidate and the stored name to share a **distinctive** word (not a generic
   product-type word like *toothpaste*, *gel*, *cereal*). Otherwise the row is
   rejected: returning a stranger's fluoride reading is worse than an honest miss.
4. The first accepted row becomes the match. Nothing accepted → `none`, and the
   rules engine scores from a cold start.

If the front panel was unreadable, the app says so explicitly rather than
pretending the catalogue was searched.

### 16.5 Load the published ruleset

The app fetches the published ruleset for the category from the database, validates
its shape, and caches it in the browser for a few minutes. If the network is
unavailable the cached copy is used; every verdict records the ruleset
**version** it was scored with.

### 16.6 Score and render

`runScanPipeline` builds the engine context (using the **ingredients panel's** OCR
confidence and truncation, plus the front text for certification/ppm checks) and
routes to exactly one engine:

- a catalogue match → the stored verdict;
- otherwise, no readable back text → an explicit "couldn't read the ingredients"
  error (never a confident-looking default verdict);
- otherwise → `gmoEngine` or `fluorideEngine`.

The resulting `EngineResult` is rendered by the verdict screen. Because the result
shape is shared, the same screen renders a food verdict and an oral-care verdict
unchanged.

---

## 17. Worked examples

**Certified-organic granola, clean photo.** Front label reads "USDA ORGANIC".
Certification short-circuit → **Low GMO likelihood**, confidence **High** — the
soybean oil in the ingredients never gets a chance to raise the tier.

**Instant noodles declaring "soybean and/or canola oil" among other ingredients.**
Two distinct crop families, no certification → **High GMO likelihood**. Confidence
depends on the read: full list, strong name match, high recognition → High.

**A toothpaste reading "0.243% sodium fluoride"** on the back panel. Compound
matched, percentage converted to ppm via the compound multiplier, routed to the
toothpaste table → its ppm row decides the tier (e.g. **Standard**), confidence
**High** if the list was complete and a number was adjacent.

**A toothpaste with a salt named but no number.** The engine uses the compound's
default ppm and flags it → the confidence cap at **Medium** means it can never read
as High, because the missing concentration always withholds High.

**A label photographed at −20°.** Deskew levels it first; without that step the
same photo returned 0 characters and the scan would have failed.

**A product genuinely not in the catalogue with a readable front.** Identification
returns `none`, the rules engine scores the ingredient list, and the screen says
*"We couldn't find this product"* — with the provisional verdict a tap away and the
contribution flow as the primary action.

## 18. Glossary

- **Engine** — the deterministic rules function that produces a verdict for one
  category (`gmoEngine`, `fluorideEngine`).
- **Ruleset / lookup config** — the versioned data tables the engines read
  (crop aliases, ambiguous terms, ppm ranges, multipliers). Published in the
  database; editable without an app redeploy.
- **EngineResult** — the shared result shape: verdict tier + label, confidence
  tier + score + factors, matched terms, guidance, constraint notice, and the
  ruleset version.
- **Confidence** — how much to trust the *read* (0–5 points → Low/Medium/High),
  separate from the verdict.
- **Trigram similarity** — the catalogue name-matching score (0–1); ≥ 0.8 is a
  strong match, 0.4–0.79 tentative, below 0.4 no match.
- **Deskew** — rotating a photo level so OCR can read it.
- **ppm** — parts per million; the concentration unit fluoride verdicts are read
  against.
- **N** — the number of distinct GMO-linked crop families in a food label's
  ingredient list.
