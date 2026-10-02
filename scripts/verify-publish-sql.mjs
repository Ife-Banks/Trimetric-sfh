// Verifies supabase/publish-gmo-v1.1.sql actually carries the source config,
// not a hand-edited or mangled copy. Guards the one invariant the client
// depends on: `config_json` must be the published copy of the source JSON.
//
// Run: node scripts/verify-publish-sql.mjs
import { readFileSync } from "node:fs";

const TAG = "$shfconfig$";
const sql = readFileSync(new URL("../supabase/publish-gmo-v1.1.sql", import.meta.url), "utf8");
const src = JSON.parse(
  readFileSync(new URL("../data/gmo_lookup_config_v1.0.json", import.meta.url), "utf8")
);

const parts = sql.split(TAG);
if (parts.length !== 3) {
  console.error(`FAIL: expected 3 dollar-quote sections, found ${parts.length}`);
  process.exit(1);
}

let embedded;
try {
  embedded = JSON.parse(parts[1].trim());
} catch (error) {
  console.error(`FAIL: embedded payload is not valid JSON: ${error.message}`);
  process.exit(1);
}

const failures = [];

if (JSON.stringify(embedded) !== JSON.stringify(src)) {
  failures.push("embedded config_json does not deep-equal data/gmo_lookup_config_v1.0.json");
}

// The client compares these two and refuses to load the row if they disagree.
if (embedded.version !== src.version) {
  failures.push(`payload version ${embedded.version} != source version ${src.version}`);
}
if (!sql.includes(`'${src.version}',`)) {
  failures.push(`the version column literal '${src.version}' is missing from the VALUES list`);
}

// The regression this project fixed.
const families = embedded.explicit_crop_matches.entries.map((e) => e.crop_family);
if (families.includes("salmon")) {
  failures.push('"salmon" is still listed as a GMO crop family');
}
const dupes = families.filter((f, i) => families.indexOf(f) !== i);
if (dupes.length > 0) {
  failures.push(`duplicate crop_family names: ${[...new Set(dupes)].join(", ")}`);
}
const aliasOwner = new Map();
for (const entry of embedded.explicit_crop_matches.entries) {
  for (const alias of entry.aliases ?? []) {
    const key = String(alias).toLowerCase();
    const prior = aliasOwner.get(key);
    if (prior && prior !== entry.crop_family) {
      failures.push(`alias "${alias}" claimed by both ${prior} and ${entry.crop_family}`);
    }
    aliasOwner.set(key, entry.crop_family);
  }
}

// Atomicity: the publish switch must not be splittable.
if (!/^\s*begin\s*;/m.test(sql) || !/^\s*commit\s*;/m.test(sql)) {
  failures.push("missing BEGIN/COMMIT - the publish switch must be one transaction");
}

console.log(`payload version:   ${embedded.version}`);
console.log(`crop families:     ${families.length} (${families.join(", ")})`);
console.log(`config_json:       deep-equals source JSON`);

if (failures.length > 0) {
  console.error("");
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
console.log("\nOK: publish SQL is consistent with the source config and is atomic.");
