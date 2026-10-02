// One-shot: map Tailwind's BUILT-IN palette utilities onto theme-aware tokens.
//
// WHY THIS EXISTS SEPARATELY FROM tokenize-palette.mjs
//   That script handled literal hex values. Tailwind's own palette — `bg-white`,
//   `text-white` — is just as opaque: there is no `dark:` variant, so a white
//   card stays white in dark mode while the text on it inverts. The result was
//   pale text on a white card at a 1.1:1 contrast ratio, which is unreadable.
//
//   --surface is #FFFFFF in light, so `bg-white` -> `bg-surface` is visually
//   IDENTICAL in light mode and correct in dark. Same for
//   `text-white` -> `text-ink-on-brand` (#FFFFFF light / #0B1614 dark).
//
//   DELIBERATELY NOT TOUCHED
//     src/components/capture/CameraView.tsx - `bg-black` and `text-white` there
//       are viewfinder chrome drawn over a live camera preview and a photo of a
//       label. A "dark mode" version of a camera viewfinder makes no sense; the
//       chrome must contrast with the picture, not with the app theme.
//     `border-white` - a ring drawn around a saturated brand fill, and correct
//       in both themes.
//
// Run: node scripts/tokenize-builtins.mjs [--dry]

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SRC = join(ROOT, "src");
const DRY = process.argv.includes("--dry");

/** Files whose white/black utilities are viewfinder chrome, not app surfaces. */
const CAMERA_CHROME = new Set(["src/components/capture/CameraView.tsx"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "vendor") continue;
      walk(full, out);
    } else if (/\.tsx$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC).filter((f) => !f.includes(`${"ui"}`));
const changed = [];
let bgSurface = 0;
let textOnBrand = 0;

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (CAMERA_CHROME.has(rel)) continue;

  const before = readFileSync(file, "utf8");
  let after = before;

  // Card / panel surfaces. `bg-white/70` keeps its opacity suffix.
  //
  // The boundary character class IS the lesson here. Two earlier versions only
  // allowed whitespace before the utility, which silently skipped:
  //   `!bg-white`               - the important form, 9 unreadable elements
  //   `[&_button]:bg-white`     - the variant form, 3 OAuth buttons at 1.0:1
  // Both were real dark-mode failures that every static check passed. So the
  // boundary now also admits `!`, `:` (any variant) and `]`.
  after = after.replace(
    /(^|[\s"\]}:])(\!)?bg-white(?=(?:[/\d])?(?=[\s"`/]))/g,
    (_m, pre, bang) => { bgSurface++; return `${pre}${bang ?? ""}bg-surface`; }
  );
  // White text sitting on a saturated brand fill.
  after = after.replace(
    /(^|[\s"\]}:])(\!)?text-white(?=(?:[/\d])?(?=[\s"`/]))/g,
    (_m, pre, bang) => { textOnBrand++; return `${pre}${bang ?? ""}text-ink-on-brand`; }
  );

  if (after !== before) {
    changed.push(rel);
    if (!DRY) writeFileSync(file, after, "utf8");
  }
}

console.log(`mode:          ${DRY ? "dry run" : "apply"}`);
console.log(`files changed: ${changed.length}`);
console.log(`bg-white   -> bg-surface:        ${bgSurface}`);
console.log(`text-white  -> text-ink-on-brand: ${textOnBrand}`);
if (changed.length) {
  console.log("");
  for (const c of changed) console.log(`  ${c}`);
}
console.log("");
console.log("skipped (viewfinder chrome, intentionally theme-independent):");
for (const c of CAMERA_CHROME) console.log(`  ${c}`);
