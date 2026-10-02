// READ-ONLY check of the currently published lookup_config rows.
//
// Answers "what is the database actually serving right now?" without changing
// anything, so you can confirm the salmon entry is still live BEFORE running
// supabase/publish-gmo-v1.1.sql and confirm it is gone afterwards.
//
// Uses the anon key, which is all the app itself uses - it reads the same rows
// the app reads, through the same RLS policies. Nothing is written.
//
// Run: npm run lookup:status

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  } catch {
    // .env.local is optional if the variables are already exported.
  }
}

loadEnvFile(new URL("../.env.local", import.meta.url));
loadEnvFile(new URL("../.env", import.meta.url));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.\n" +
      "Expected them in .env.local (see .env.local.example)."
  );
  process.exit(2);
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase
  .from("lookup_config")
  .select("category, version, is_published, published_at, config_json")
  .in("category", ["gmo_food", "oral_care"])
  .order("category");

if (error) {
  console.error(`Could not read lookup_config: ${error.message}`);
  process.exit(1);
}

let problems = 0;

for (const row of data ?? []) {
  const published = row.is_published ? "PUBLISHED" : "unpublished";
  const json = row.config_json ?? {};
  const agrees = json.version === row.version;
  if (row.is_published && !agrees) {
    problems++;
  }
  console.log(
    `${row.category.padEnd(10)} v${String(row.version).padEnd(5)} ${published.padEnd(11)} ` +
      `json_version=${String(json.version).padEnd(5)} ${agrees ? "ok" : "MISMATCH"}`
  );
}

// The specific regressions this project fixed.
const gmo = (data ?? []).find((r) => r.category === "gmo_food" && r.is_published);
const entries = gmo?.config_json?.explicit_crop_matches?.entries ?? [];
const families = entries.map((e) => e.crop_family);

console.log("");
if (!gmo) {
  console.log("WARNING: no published GMO ruleset. Scans will fail closed with");
  console.log('         "No valid published GMO ruleset is available."');
  problems++;
} else {
  console.log(`Published GMO ruleset: v${gmo.version}, ${families.length} crop families`);
  console.log(`  ${families.join(", ")}`);

  // 1. A non-crop listed as a crop family.
  //    Salmon is an animal product. The archived spec recorded it as
  //    deliberately excluded; v1.0.0 shipped it by mistake in some datasets.
  if (families.includes("salmon")) {
    console.log('  [!] "salmon" is listed as a GMO crop family. It is an animal');
    console.log("      product, so smoked salmon scores High GMO Likelihood.");
    problems++;
  }

  // 2. Two different families claiming the SAME alias. This is the bug class
  //    that actually shipped: v1.0 had both "cottonseed" and "cotton" entries
  //    whose alias lists overlapped, so one ingredient could be counted as two
  //    distinct crops, inflating N and pushing a Medium verdict to High.
  //    Comparing family NAMES for duplicates misses this; the aliases are what
  //    collide.
  const aliasOwner = new Map();
  const clashes = [];
  for (const entry of entries) {
    for (const alias of entry.aliases ?? []) {
      const key = String(alias).toLowerCase();
      const prior = aliasOwner.get(key);
      if (prior && prior !== entry.crop_family) {
        clashes.push(`"${alias}" claimed by both ${prior} and ${entry.crop_family}`);
      }
      aliasOwner.set(key, entry.crop_family);
    }
  }
  if (clashes.length > 0) {
    console.log("  [!] overlapping aliases - one ingredient could count as two crops:");
    for (const c of clashes) console.log(`        ${c}`);
    problems++;
  }

  // 3. Repeated family names.
  const dupNames = [...new Set(families.filter((f, i) => families.indexOf(f) !== i))];
  if (dupNames.length > 0) {
    console.log(`  [!] duplicate crop_family names: ${dupNames.join(", ")}`);
    problems++;
  }

  if (gmo.version === "1.0") {
    console.log("  [!] still v1.0 - the v1.1 corrections are not published yet.");
    problems++;
  }
}

console.log("");
console.log(problems === 0 ? "OK - published rulesets look consistent." : `${problems} problem(s) found.`);
process.exit(problems === 0 ? 0 : 1);
