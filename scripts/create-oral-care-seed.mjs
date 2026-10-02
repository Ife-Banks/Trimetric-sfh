import { readFileSync, writeFileSync } from "node:fs";

const source = readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8");
const marker = "insert into lookup_config (category, version, config_json, is_published, published_at)\nvalues (\n  'oral_care',\n  '1.3',";
const start = source.indexOf(marker);

if (start < 0) throw new Error("Could not find the oral_care 1.3 seed block.");

const end = source.indexOf("\n  set config_json = excluded.config_json,\n      is_published = excluded.is_published,\n      published_at = excluded.published_at;", start);
if (end < 0) throw new Error("Could not find the end of the oral_care seed block.");

const blockEnd = end + "\n  set config_json = excluded.config_json,\n      is_published = excluded.is_published,\n      published_at = excluded.published_at;".length;
const sql = `-- Oral-care fluoride ruleset only; safe to rerun. Does not seed GMO data.\n\nbegin;\n\n${source.slice(start, blockEnd)}\n\ncommit;\n\nselect category, version, is_published\nfrom public.lookup_config\nwhere category = 'oral_care'\norder by version;\n`;

writeFileSync(new URL("../supabase/seed-oral-care.sql", import.meta.url), sql);
process.stdout.write("Created supabase/seed-oral-care.sql\n");
