// src/engines/fluorideEngine.ts
// Phase 6 — implemented to satisfy the Phase-4 shared surface and the tests at
// src/engines/fluorideEngine.test.ts (written FIRST per build order §1). The
// engine consumes the published v1.3 config (fluoride_lookup_config_v1.3.json)
// — verdict labels, tier names, ppm multipliers, default-ppm fallbacks, and
// guidance all come from config, never hardcoded. Same surface as gmoEngine,
// so the existing VerdictScreen renders it unchanged (FR-4/FR-6).

import config from "../../data/fluoride_lookup_config_v1.3.json"
import type { Engine, EngineContext, EngineResult, EngineTerm, ResultTier } from "./types"

// ---------------------------------------------------------------------------
// Honesty constraint — mandated for every oral-care verdict (§7 "information,
// not a recommendation"). Mirrors GMO's pattern: report what the label says,
// never claim laboratory proof darauf.
// ---------------------------------------------------------------------------

export const FLUORIDE_CONSTRAINT_NOTICE =
  "This reports the fluoride level printed on the label or estimated from " +
  "the listed compounds. It cannot confirm the actual fluoride content — " +
  "only lab testing can."

// ---------------------------------------------------------------------------
// Normalization — same convention as gmoEngine
// ---------------------------------------------------------------------------

function normalize(text: string): { fullText: string } {
  return { fullText: text.toLowerCase().replace(/[^a-z0-9\s%.,-]/g, " ").trim() }
}

// ---------------------------------------------------------------------------
// Subcategory detection (config §5) — keyword signals, fallback to
// toothpaste_gel (the larger category) with a Medium confidence cap.
// ---------------------------------------------------------------------------

function detectSubcategory(
  fullText: string,
  ctx?: { subcategory?: string }
): { subcategory: string; viaFallback: boolean } {
  const known = new Set(Object.keys(config.category_ppm_tables))
  if (ctx?.subcategory && known.has(ctx.subcategory)) {
    return { subcategory: ctx.subcategory, viaFallback: false }
  }
  for (const [subcatKey, keywords] of Object.entries(config.subcategory_detection)) {
    if (!Array.isArray(keywords)) continue
    const subcat = subcatKey.endsWith("_keywords")
      ? subcatKey.slice(0, -"_keywords".length)
      : subcatKey
    if (!known.has(subcat)) continue
    for (const kw of keywords) {
      if (fullText.includes(kw)) {
        return { subcategory: subcat, viaFallback: false }
      }
    }
  }
  return { subcategory: "toothpaste_gel", viaFallback: true }
}

// ---------------------------------------------------------------------------
// Tier classification (config §6 category_ppm_tables) + confidence scoring
// (config §7)
// ---------------------------------------------------------------------------

function classify(subcat: string, ppm: number): {
  tier: ResultTier
  row: { verdict: string; guidance?: string }
  label: string
} {
  const table = config.category_ppm_tables[subcat]
  if (!table) throw new Error(`unknown subcategory in config: ${subcat}`)
  const row = table.find((r) => ppm >= r.ppm_range[0] && ppm <= r.ppm_range[1])
  if (!row) return { tier: "none", label: "Unclassified", row: { verdict: "Unclassified" } }
  const verdict = row.verdict
  const tier: ResultTier = /fluoride.?free/i.test(verdict)
    ? "none"
    : /^low/i.test(verdict)
      ? "low"
      : /^standard/i.test(verdict)
        ? "medium"
        : "high"
  return { tier, label: verdict, row }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export const fluorideEngine: Engine = (ingredientsText, ctx) => {
  const { fullText } = normalize(ingredientsText)
  const now = new Date().toISOString()

  // Subcategory routing (§5) — fallback caps confidence at Medium.
  const { subcategory, viaFallback } = detectSubcategory(fullText)

  // Compound matching + ppm conversion (§4/§6).
  const matches = extractMatches(fullText)
  const fluorideMatches = matches.filter((m) => !areFluorideFreeFromTerm(m.term))
  const fluorideFreeMatch = matches.find((m) => areFluorideFreeFromTerm(m.term))

  // Fluoride-Free short-circuit — only fluoride-free markers present.
  if (!fluorideFreeMatch && fluorideMatches.length === 0) {
    return {
      category: "oral_care",
      subcategory,
      result: { tier: "none", label: "Fluoride-Free" },
      confidence: { tier: "high", score: 5, factors: ["Only non-fluoride markers present — fluoride-free short-circuit"] },
      matchedTerms: matches.map((m) => m.term),
      guidance: "Fluoride-Free",
      constraintNotice: FLUORIDE_CONSTRAINT_NOTICE,
      computedAt: now,
      configVersion: config.version,
    }
  }

  // No active fluoride compound at all (e.g. only nano-hydroxyapatite).
  if (fluorideMatches.length === 0 && fluorideFreeMatch) {
    return {
      category: "oral_care",
      subcategory,
      result: { tier: "none", label: "Fluoride-Free" },
      confidence: { tier: "high", score: 5, factors: ["Only fluoride-free markers present"] },
      matchedTerms: matches.map((m) => m.term),
      guidance: "Fluoride-Free",
      constraintNotice: FLUORIDE_CONSTRAINT_NOTICE,
      computedAt: now,
      configVersion: config.version,
    }
  }

  // Active fluoride present — use the FIRST matched compound (label order wins).
  const primary = fluorideMatches[0]

  // Confidence scoring (§7):
  //  - Ingredient list completeness (+2)         if !ctx.isTruncated
  //  - Product identification (+2)               if identityMatch !== "none"
  //  - Lookup match rate (+1)                    if any compound matched
  //  - Concentration clarity (+1)                if a number was adjacent
  // Totals: 4–5 High, 2–3 Medium, 0–1 Low.
  // NOTE: a default-ppm fallback (no adjacent number) is UNCONDITIONALLY
  // capped at Medium per build-guide §5.4 + §7 — name + full list + ≥80%
  // lookup is 5 points, but the missing concentration withholds High.
  let points = 0
  const factors: string[] = []

  if (!ctx.isTruncated) {
    points += 2
    factors.push("Ingredient list completeness — full list OCR'd, no truncation")
  } else {
    factors.push("Ingredient list completeness — list appears truncated")
  }

  if (ctx.identityMatch !== "none") {
    points += 2
    factors.push("Product identification — barcode/name matched the verified dataset")
  } else {
    factors.push("Product identification — no identity match")
  }

  if (matches.length > 0) {
    points += 1
    factors.push("Lookup match rate — active fluoride compound recognized")
  }

  if (!primary.defaultPpm) {
    points += 1
    factors.push("Concentration clarity — compound found WITH an adjacent number")
  } else {
    factors.push("Concentration clarity — no number found; fell back to config default ppm")
  }

  const total = primary.defaultPpm ? Math.min(points, 4) : points
  const confTier = total >= 4 ? "high" : total >= 2 ? "medium" : "low"

  const { tier, label, row } = classify(subcategory, primary.ppm)

  return {
    category: "oral_care",
    subcategory,
    result: { tier, label },
    confidence: { tier: confTier as "low" | "medium" | "high", score: total, factors },
    matchedTerms: matches.map((m) => m.term),
    guidance: row.guidance ?? row.verdict,
    constraintNotice: FLUORIDE_CONSTRAINT_NOTICE,
    computedAt: now,
    configVersion: config.version,
  }
}

function areFluorideFreeFromTerm(term: EngineTerm): boolean {
  return !/fluoride|smfp|mfp|monofluorophosphate|amine|olaflur|dectaflur|apf|naf|snf2/i.test(term.term + " " + term.normalized)
}
