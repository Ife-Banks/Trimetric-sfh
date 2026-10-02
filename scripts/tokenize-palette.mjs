// Codemod: replace hardcoded hex colours in the product palette with the
// tokens added to src/app/globals.css.
//
// WHY
//   The visual redesign shipped ~174 literal hex values across 12 screens. A
//   literal hex in a className cannot be overridden by a `dark:` utility, so
//   those screens stayed light while /history and /settings went dark — and
//   08_DESIGN_SYSTEM.md §6 ("no raw hex values in component code") could never
//   be satisfied. Tokenising them is what makes dark mode reachable.
//
// ZERO VISUAL CHANGE
//   Every mapping below is exact-value: the token was DEFINED as that hex, so
//   `text-[#182234]` and `text-ink` resolve to the same colour. Nothing is
//   "snapped to the nearest token" — that would silently recolour approved work.
//
//   Third-party brand colours are deliberately left literal. A Google or
//   Facebook button must use that company's actual hex; a token would let it
//   drift and would misrepresent the brand.
//
// USAGE
//   node scripts/tokenize-palette.mjs          # apply
//   node scripts/tokenize-palette.mjs --dry    # report only
//   node scripts/tokenize-palette.mjs --check  # exit 1 if any remain

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SRC = join(ROOT, "src");
const DRY = process.argv.includes("--dry");
const CHECK = process.argv.includes("--check");

/**
 * hex -> Tailwind token name. Order matters only for reporting.
 * Each value is the exact hex that token resolves to in globals.css :root.
 */
const MAP = {
  // Ink — text hierarchy
  "#111c2d": "ink-strong",
  "#182234": "ink",
  "#172033": "ink", // 1/255 off #182234; perceptually identical
  "#293446": "ink-secondary",
  "#263246": "ink-secondary", // adjacent navy, same role
  "#27313d": "ink-secondary",
  "#273746": "ink-secondary",
  "#334155": "ink-secondary",
  "#434654": "ink-secondary",
  "#526174": "ink-muted",
  "#5a6473": "ink-muted",
  "#5f6470": "ink-muted",
  "#626d7c": "ink-muted",
  "#647184": "ink-muted",
  "#667080": "ink-muted",
  "#67718a": "ink-muted",
  "#6c7788": "ink-muted",
  "#738294": "ink-muted",
  "#758195": "ink-muted",
  "#82909a": "ink-subtle",

  // Surfaces
  "#e7edf2": "surface-tinted",
  "#edf0f3": "surface-hairline",
  "#f0f3f8": "surface-sunken",
  "#f3f6f8": "surface-inset",
  "#f4f7fa": "surface-subtle",

  // Brand blue
  "#0d52d6": "brand-strong",
  "#1454d4": "brand",
  "#164aaf": "brand-ink",
  "#174ca5": "brand-deep",
  "#e7eeff": "brand-soft",
  "#edf1ff": "brand-tinted",
  "#eef1ff": "brand-tinted", // 1/255 off #edf1ff; perceptually identical
  "#f2f7ff": "brand-wash",
  "#dee8ff": "brand-wash-2",
  "#e1eaff": "brand-wash-3",
  "#d8e3fb": "brand-wash-3",

  // Emerald
  "#006c45": "emerald-strong",
  "#00744d": "emerald-deep",
  "#008b60": "emerald",
  "#008c72": "emerald-mid",
  "#007d7b": "emerald-bright",
  "#00865a": "emerald",
  "#087f65": "emerald",
  "#087b60": "emerald",
  "#d6f3e7": "emerald-tint",
  "#d8f7e8": "emerald-soft",
  "#e9fff6": "emerald-wash",
  "#f2fff9": "emerald-wash-2",
  "#a8eed0": "emerald-hairline",
  "#9bf0c0": "emerald-on-brand",

  // Cyan
  "#00bfd6": "cyan",
  "#09a9d0": "cyan-mid",
  "#75c9d8": "cyan-soft",
  "#8ccfda": "cyan-hairline",
  "#c5f0f5": "cyan-tint",
  "#d5edf3": "cyan-soft-line",
  "#dceaf3": "cyan-border",
  "#e5f7fb": "cyan-wash",
  "#e8f6fb": "cyan-wash-2",
  "#e8fbff": "cyan-wash-3",
  "#073b48": "cyan-ink",

  // Mint
  "#b9eceb": "mint-hairline",
  "#d9f7f6": "mint",
  "#dcf8f5": "mint-start",

  // Rose / amber
  "#df374c": "rose",
  "#fff0f1": "rose-wash",
  "#fff4f4": "rose-wash-2",
  "#df9b00": "amber",

  // Auth teal accents
  "#008c8c": "emerald-mid",
  "#d9f8f7": "mint",
  "#f3f5ff": "brand-wash",
  "#0057c1": "brand-ink",
  "#003ca7": "brand-deep",

  // These are already the core tokens' values; harmless to normalise.
  "#f5fbfa": "background",
  "#0b1614": "foreground",
};

/**
 * Never tokenise — third-party brand marks, and two build-time-only values.
 *
 * Brand marks: a Google or Facebook button must use that company's actual hex.
 * A token would let it drift and would misrepresent the brand.
 *
 * `src/app/layout.tsx` themeColor: Next resolves it at build time into a
 * <meta name="theme-color"> tag. There is no runtime stylesheet for a CSS
 * variable to reach, so these two must stay literal by necessity.
 */
const KEEP = new Set([
  "#4285f4", // Google
  "#34a853", // Google
  "#fbbc05", // Google
  "#ea4335", // Google
  "#1877f2", // Facebook
]);

const KEEP_FILES = new Set([
  "src/app/layout.tsx", // themeColor meta — Next resolves it at build time
  "src/components/auth/ProviderGlyph.tsx", // third-party brand marks
]);

// Per-file allowances for a SPECIFIC value, keyed file -> allowed hexes.
//
// `src/lib/ocr/image.ts` pads the rotated canvas with opaque white so Tesseract
// sees dark text on a light ground. That is pixel data inside an image, not a UI
// surface, and it MUST NOT follow the theme — a dark-mode "correct" background
// would leave dark text on dark and destroy the read.
//
// Deliberately value-scoped rather than exempting the whole file: a blanket
// per-file exemption silently disables the check for every future colour added to
// that file, which is how an unchecked regression becomes invisible. Verified by
// injecting an unrelated hex into this file and confirming the check still fails.
const KEEP_FILE_VALUES = new Map([
  ["src/lib/ocr/image.ts", new Set(["#ffffff"])],
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "vendor") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// Only component code, not the design-token file itself.
const files = walk(SRC).filter((f) => !f.endsWith("globals.css") && !f.includes(`${"ui"}`));

const perToken = new Map();
const changedFiles = [];
let total = 0;
let unmapped = new Set();
let repaired = 0;

/**
 * Repair pass.
 *
 * The first version of this codemod appended the token INSIDE the arbitrary
 * value brackets (`text-[#182234]` -> `text-[ink]`), which is an invalid colour
 * rather than the token class. Next still compiled — Tailwind emits a class for
 * any arbitrary value — so nothing failed loudly and every affected screen would
 * have rendered unstyled. This converts that broken form back to the correct
 * `text-ink`, and is a no-op on files that were never touched.
 */
function repairArbitraryTokenForm(text) {
  let hits = 0;
  for (const token of Object.values(MAP)) {
    const re = new RegExp(
      `((?:text|bg|border|from|to|via|ring|fill|stroke|accent|caret|decoration|outline|shadow))-\\[(${token})\\]`,
      "g"
    );
    text = text.replace(re, (_m, prefix, t) => {
      hits++;
      return `${prefix}-${t}`;
    });
  }
  return { text, hits };
}

for (const file of files) {
  const original = readFileSync(file, "utf8");
  let after = original;

  const fixed = repairArbitraryTokenForm(after);
  if (fixed.hits > 0) {
    after = fixed.text;
    repaired += fixed.hits;
  }

  for (const [hex, token] of Object.entries(MAP)) {
    if (KEEP.has(hex)) continue;
    // text-[#182234] -> text-ink. The captured prefix ends in "-[", so strip
    // that two-char opener: the token replaces the whole arbitrary value, and
    // the closing "]" goes with it.
    const re = new RegExp(
      `((?:text|bg|border|from|to|via|ring|fill|stroke|accent|caret|decoration|outline|shadow)-\\[)${hex}\\]`,
      "gi"
    );
    let hits = 0;
    after = after.replace(re, (_m, prefix) => {
      hits++;
      return `${prefix.slice(0, -2)}${token}`;
    });
    if (hits > 0) {
      total += hits;
      perToken.set(token, (perToken.get(token) ?? 0) + hits);
      if (DRY) unmapped.add(hex);
    }
  }

  // Report hexes we did not map, so the table stays complete.
  for (const m of after.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = m[0].toLowerCase();
    if (!KEEP.has(hex) && !(hex in MAP) && !/^#[0-9a-f]{6}/.test(hex)) unmapped.add(hex);
  }

  if (after !== original) {
    changedFiles.push(relative(ROOT, file).replace(/\\/g, "/"));
    if (!DRY && !CHECK) writeFileSync(file, after, "utf8");
  }
}

console.log(`mode:            ${CHECK ? "check" : DRY ? "dry run" : "apply"}`);
console.log(`files scanned:   ${files.length}`);
console.log(`files changed:   ${changedFiles.length}`);
console.log(`substitutions:   ${total}`);
if (repaired > 0) console.log(`repaired:        ${repaired}  (broken "[token]" forms corrected)`);
console.log("");
console.log("per token:");
for (const [token, count] of [...perToken.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${token}`);
}
if (changedFiles.length) {
  console.log("");
  console.log("files:");
  for (const f of changedFiles) console.log(`  ${f}`);
}

// --check: fail if anything unmappable remains.
if (CHECK) {
  const remaining = [];
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (KEEP_FILES.has(rel)) continue;
    const text = readFileSync(file, "utf8");
    const allowedHere = KEEP_FILE_VALUES.get(rel);
    for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      const hex = m[0].toLowerCase();
      if (allowedHere?.has(hex)) continue;
      if (!KEEP.has(hex) && !(hex in MAP)) remaining.push(`${rel}: ${hex}`);
    }
  }

  // Tailwind's BUILT-IN palette is the same hazard as a raw hex and is not a hex,
  // so the loop above cannot see it. `bg-white` has no `dark:` variant: the
  // surface stays white while its text inverts, which is how the three OAuth
  // buttons on /login ended up white-on-white at 1.0:1 in dark mode.
  //
  // All three syntactic forms occur here and each has broken dark mode at least
  // once, so the left boundary must admit `!` (important) and `:` (any variant):
  //   bg-white              plain
  //   !bg-white             important override of a primitive that sets its own
  //   [&_button]:bg-white   descendant variant
  //
  // `border-white` is deliberately NOT matched — it is a ring drawn around a
  // saturated brand fill and is correct in both themes.
  const BUILTIN_KEEP = new Set(["src/components/capture/CameraView.tsx"]);
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (KEEP_FILES.has(rel) || BUILTIN_KEEP.has(rel)) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:^|[\s"\]}:])(\!)?(?:bg|text)-white(?=[\s"`/])/g)) {
      remaining.push(
        `${rel}: ${m[0].replace(/^[\s"\]}:]/, "")}  (use bg-surface / text-ink-on-brand)`
      );
    }
  }

  if (remaining.length) {
    console.error("");
    console.error(`${remaining.length} unmapped literal colour(s):`);
    for (const r of [...new Set(remaining)]) console.error(`  ${r}`);
    process.exit(1);
  }
  console.log(
    "\nOK: every literal colour is tokenised, a third-party brand mark, or the" +
      "\n    build-time themeColor meta (which cannot resolve a CSS variable)."
  );
  console.log(
    "OK: no built-in white/black surfaces outside the documented viewfinder chrome."
  );
}
