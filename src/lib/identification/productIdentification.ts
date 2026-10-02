// Product identification from OCR'd front-label name. Ingredients are always
// OCR'd separately and scored by the category's deterministic rules engine.
//
// Query failures (offline, RPC not deployed yet, etc.) degrade to the next
// tier rather than throwing — the scan always proceeds.

import type { SupabaseClient } from "@supabase/supabase-js";
import { NAME_MATCH_THRESHOLD } from "@/engines/constants";

// Re-exported so existing importers of the thresholds from this module keep
// working. The values now have a single home in src/engines/constants.ts, which
// is what lets src/engines/ stay free of Supabase imports
// (06_AGENT_CONTEXT.md §5).
export { NAME_MATCH_THRESHOLD, NAME_MATCH_STRONG } from "@/engines/constants";

export type IdentityMatch = "barcode" | "name" | "none";

export interface ProductRow {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: "gmo_food" | "oral_care";
  subcategory: string;
  ingredients_text: string;
  result_tier: "none" | "low" | "medium" | "high";
  result_label: string;
  confidence_tier: "none" | "low" | "medium" | "high";
  matched_terms: unknown;
  guidance_text: string | null;
  config_version: string;
  similarity?: number; // present on name-match rows (RPC column)
}

/**
 * One catalogue-lookup attempt, recorded so a failed match can be explained.
 *
 * This exists because "couldn't find this product" was undiagnosable: a missing
 * RPC, a permissions error and a genuine no-match all rendered the same screen,
 * because the error was discarded (`if (error || …) continue`). A user reporting
 * "it's in the database but the app says it isn't" is describing exactly the case
 * this makes observable.
 */
export interface IdentifyAttempt {
  /** The OCR-derived string that was sent. */
  candidate: string;
  /** Rows the RPC returned at or above threshold. */
  rows: number;
  /** Best similarity the RPC reported, when it returned anything. */
  topSimilarity: number | null;
  /** PostgREST error message when the call itself failed. */
  error: string | null;
  /** True for the attempt that produced the accepted row. */
  accepted: boolean;
}

export interface IdentificationResult {
  tier: 1 | 2 | 0;
  identityMatch: IdentityMatch;
  barcode?: string;
  product?: ProductRow;
  similarity?: number;
  note?: string;
  /** Every lookup tried, in order. Diagnostics only — never rendered as truth. */
  attempts?: IdentifyAttempt[];
}

export interface IdentifyArgs {
  frontText: string;
  category: "gmo_food" | "oral_care";
  supabase: Pick<SupabaseClient, "from" | "rpc">;
}

function meaningfulLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((line) => line.length >= 3 && /[a-z]{3}/i.test(line))
}

/**
 * Can the front panel yield a searchable product name at all?
 *
 * Exported because the answer changes what the UI is allowed to say. "We don't
 * have this product in our database yet" is FALSE and actively misleading when
 * the real cause is that the front photo was never readable — a case observed
 * with a perfectly stocked catalogue and a legible-on-screen label that OCR
 * returned 29 characters of noise for.
 *
 * Deliberately the SAME predicate `identifyProduct` uses to build candidates, so
 * the UI can never claim the label was read when the matcher had nothing to
 * search with.
 */
export function isFrontPanelReadable(frontText: string): boolean {
  return meaningfulLines(frontText).length > 0;
}

/**
 * Product-type words that appear in almost every name in a category.
 *
 * `word_similarity` matches on any shared word, so these let a scan of a brand
 * that does not exist adopt a stranger's stored verdict. Measured against the
 * live catalogue: the OCR'd line "Toothpaste 50ml" scored 0.688 against "GUM
 * Dental Paste Toothpaste", and "Whitening Anticavity Paste" scored 0.481
 * against "ACT Restoring Anticavity Fluoride Mouthwash" — a mouthwash. Both are
 * above the 0.4 threshold, and both returned the wrong product's fluoride
 * reading as if it were verified.
 *
 * A match must therefore share at least one word that is NOT in this set, so
 * "Toothpaste" alone can never carry a match — but "Colgate", "Sensodyne" or
 * "Pronamel" still can.
 */
const GENERIC_PRODUCT_WORDS = new Set([
  // oral care
  "toothpaste", "toothpastes", "paste", "pastes", "mouthwash", "mouthrinse",
  "rinse", "rinses", "gel", "gels", "cream", "creme", "formula", "formulae",
  "spray", "spray", "drops", "powder", "flakes", "gum", "mouth", "dental",
  "fluoride", "fluorides", "flouride", "whitening", "white", "sensitive",
  "sensitivity", "anticavity", "cavity", "care", "complete", "daily", "day",
  "protection", "protect", "repair", "restore", "restoring", "advanced",
  "plus", "ultra", "pro", "expert", "fresh", "mint", "herbal", "natural",
  "organic", "mild", "strong", "extra", "deep", "clean", "clinical", "range",
  "series", "type", "size", "pack", "tube", "jar",
  // food
  "cereal", "cereals", "biscuit", "biscuits", "cookie", "cookies", "bread",
  "pasta", "noodles", "sauce", "sauces", "oil", "oils", "milk", "juice",
  "snack", "snacks", "bar", "bars", "chips", "crisps", "chocolate", "drink",
  "drinks", "tea", "coffee", "spread", "spreads", "jam", "nuts", "rice",
  "grains", "flour", "sugar", "sweets", "sweet", "water", "sauce", "soup",
]);

/** Lowercase alphanumeric tokens of >=3 chars that contain real letters. */
function distinctiveTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length >= 3 && /[a-z]{3}/.test(t) && !GENERIC_PRODUCT_WORDS.has(t))
  );
}

/**
 * Do these two strings share a word that actually identifies a product?
 *
 * The guard against a generic-word-only match. A pure similarity score cannot
 * express this: "Toothpaste 50ml" vs "GUM Dental Paste Toothpaste" scores 0.688,
 * which looks like a decent match and is in fact a different product entirely.
 */
export function sharesDistinctiveWord(a: string, b: string): boolean {
  const left = distinctiveTokens(a);
  for (const token of distinctiveTokens(b)) {
    if (left.has(token)) return true;
  }
  return false;
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Fuzzy-match the OCR'd front label against the product catalogue by name.
 *
 * Every attempt is logged. The candidates are OCR-derived, so when none of them
 * matches, the useful question is "what did we actually ask the database?" — not
 * "did it match?". The OCR text is echoed (truncated) for that reason.
 */
export async function identifyProduct(args: IdentifyArgs): Promise<IdentificationResult> {
  // Fuzzy name match on OCR'd front label.
  const lines = meaningfulLines(args.frontText).slice(0, 6)
  const candidates = [
    ...lines,
    ...lines.slice(0, -1).map((line, index) => `${line} ${lines[index + 1]}`),
    compactText(args.frontText),
  ].filter((candidate, index, all) => candidate.length >= 3 && all.indexOf(candidate) === index)

  const attempts: IdentifyAttempt[] = [];

  console.groupCollapsed(
    `[scan] identify · category=${args.category} · ${candidates.length} candidate(s) from ${args.frontText.length} chars of front-label OCR`
  );

  if (candidates.length === 0) {
    // The single most common cause of a false "not in the database": the front
    // panel OCR produced nothing usable, so there was never a name to search for.
    console.warn(
      "[scan] identify · NO CANDIDATES — the front panel yielded no searchable line. " +
        "The name match could not run at all. This is an OCR/capture problem, not a database problem."
    );
  }
  console.log("[scan] identify · front-label OCR text:", args.frontText || "(empty)");

  for (const candidate of candidates) {
    const { data, error } = await args.supabase.rpc("search_products_by_name", {
      p_name: candidate,
      p_threshold: NAME_MATCH_THRESHOLD,
      p_category: args.category,
    });

    if (error) {
      // Previously swallowed. An RPC that is missing, lacks EXECUTE for anon, or
      // times out looks identical to "no match" without this.
      attempts.push({ candidate, rows: 0, topSimilarity: null, error: error.message, accepted: false });
      console.error(`[scan] identify · RPC FAILED for "${candidate}":`, error.message);
      continue;
    }

    if (!Array.isArray(data) || data.length === 0) {
      attempts.push({ candidate, rows: 0, topSimilarity: null, error: null, accepted: false });
      console.log(`[scan] identify · "${candidate}" → 0 rows (below ${NAME_MATCH_THRESHOLD})`);
      continue;
    }

    // Reject rows whose only overlap is a generic product-type word. The RPC
    // ranks on trigram/word similarity and cannot tell "same product" from
    // "same category" — this can, and a stranger's stored fluoride verdict is
    // worse than an honest miss.
    const distinctive = (data as ProductRow[]).filter((row) =>
      sharesDistinctiveWord(candidate, row.name)
    );

    if (distinctive.length === 0) {
      const rejected = data as ProductRow[];
      attempts.push({
        candidate,
        rows: 0,
        topSimilarity: typeof rejected[0]?.similarity === "number" ? rejected[0].similarity : null,
        error: null,
        accepted: false,
      });
      console.warn(
        `[scan] identify · "${candidate}" → rejected ${rejected.length} row(s) sharing only generic ` +
          `product words (best: "${rejected[0]?.name}" @ ${rejected[0]?.similarity?.toFixed(3)}). ` +
          "Not the same product."
      );
      continue;
    }

    const first = distinctive[0] as ProductRow;
    const topSimilarity = typeof first.similarity === "number" ? first.similarity : null;
    attempts.push({
      candidate,
      rows: distinctive.length,
      topSimilarity,
      error: null,
      accepted: true,
    });
    console.log(
      `[scan] identify · "${candidate}" → ${distinctive.length} row(s) with a distinctive shared word, ` +
        `top similarity ${topSimilarity?.toFixed(3)} → MATCH "${first.name}"`
    );
    console.groupEnd();
    return {
      tier: 2,
      identityMatch: "name",
      product: first,
      similarity: first.similarity,
      note: "name match via trigram similarity",
      attempts,
    };
  }

  console.warn(
    `[scan] identify · NO MATCH in category "${args.category}" across ${attempts.length} candidate(s). ` +
      "The catalogue may not contain this product, OR the front-panel OCR text differs from the stored name."
  );
  console.groupEnd();

  return { tier: 0, identityMatch: "none", note: "no product-name match", attempts };
}
