// One-shot: normalize non-ASCII punctuation to ASCII in SQL files, so they can
// be pasted into the Supabase SQL Editor without re-encoding surprises.
//
// Run: node scripts/ascii-sql.mjs <file...>
import { readFileSync, writeFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/ascii-sql.mjs <file...>");
  process.exit(2);
}

const REPLACEMENTS = [
  [/[\u2010-\u2015]/g, "-"], // hyphens / dashes
  [/[\u2190-\u21FF]/g, "->"], // arrows
  [/[\u2018\u2019]/g, "'"], // curly single quotes
  [/[\u201C\u201D]/g, '"'], // curly double quotes
  [/\u00A0/g, " "], // non-breaking space
];

for (const file of files) {
  const before = readFileSync(file, "utf8");
  let after = before;
  for (const [pattern, replacement] of REPLACEMENTS) {
    after = after.replace(pattern, replacement);
  }
  writeFileSync(file, after, "utf8");

  const offenders = [...new Set([...after])].filter((ch) => {
    const c = ch.codePointAt(0);
    return c > 0x7e || (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d);
  });
  console.log(
    `${file}: ${before === after ? "already clean" : "normalized"}` +
      (offenders.length ? `  [!] still non-ASCII: ${JSON.stringify(offenders.join(""))}` : "")
  );
}
