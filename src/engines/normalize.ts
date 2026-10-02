// Shared text normalization — 03_FRONTEND_ARCHITECTURE.md §2 requires this to be
// ONE module, not a private copy inside each engine. Both engines lower-case,
// strip punctuation and collapse whitespace; they then diverge, and that
// divergence is deliberate and documented below.
//
// This module is pure and dependency-free so `src/engines/` stays free of React
// and Supabase imports (06_AGENT_CONTEXT.md §5).

export interface NormalizedText {
  /** Lower-cased, punctuation-stripped, whitespace-collapsed full text. */
  fullText: string;
}

/** Strip a leading "Ingredients"/"Ingredients:" label, case-insensitive. */
function stripIngredientsHeader(text: string): string {
  return text.trim().replace(/^\s*ingredients\s*[:.]\s*/i, "");
}

/**
 * Normalization for ingredient-list scoring (GMO).
 *
 * `fullText` drops every non-alphanumeric character except spaces and hyphens,
 * because none of the GMO lookup terms need `%`, `.` or `,`. `tokens` splits on
 * commas from the ORIGINAL string so a token keeps its phrase ("soybean oil"),
 * which is what the lookup aliases match against.
 */
export function normalizeIngredients(text: string): NormalizedText & { tokens: string[] } {
  const stripped = stripIngredientsHeader(text);
  const fullText = stripped.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = stripped
    .split(",")
    .map((t) => t.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0);
  return { fullText, tokens };
}

/**
 * Normalization for full-label scanning (fluoride).
 *
 * Unlike the GMO path this KEEPS `%`, `.` and `,`, because the fluoride engine
 * parses concentrations like "0.243%" and "1,450 ppm ppm-f" out of the text.
 * Stripping them would make ppm detection silently impossible.
 */
export function normalizeLabel(text: string): NormalizedText {
  return {
    fullText: text
      .toLowerCase()
      .replace(/[^a-z0-9\s%.,-]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  };
}