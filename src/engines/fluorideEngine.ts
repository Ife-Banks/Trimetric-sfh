// src/engines/fluorideEngine.ts
// Phase 6 — implemented to satisfy the Phase-4 shared surface and the tests at
// src/engines/fluorideEngine.test.ts (written FIRST per build order §1). The
// engine consumes the published v1.3 config (fluoride_lookup_config_v1.3.json)
// — verdict labels, tier names, ppm multipliers, default-ppm fallbacks, and
// guidance all come from config, never hardcoded. Same surface as gmoEngine,
// so the existing VerdictScreen renders it unchanged (FR-4/FR-6).

import type { FluorideLookupConfig } from "@/lib/config/lookupConfig"
import { OCR_CONFIDENCE_PENALTY_THRESHOLD } from "./constants"
import { normalizeLabel } from "./normalize"
import type { EngineContext, EngineResult, EngineTerm, ResultTier } from "./types"

// ---------------------------------------------------------------------------
// Honesty constraint — mandated for every oral-care verdict (§7 "information,
// not a recommendation"). Mirrors GMO's pattern: report what the label says,
// never claim laboratory proof darauf.
// ---------------------------------------------------------------------------

export const FLUORIDE_CONSTRAINT_NOTICE =
  "This reports the fluoride level printed on the label or estimated from " +
  "the listed compounds. It is information only — it cannot confirm the " +
  "actual fluoride content, and it is not a medical recommendation. Only " +
  "lab testing can."

// ---------------------------------------------------------------------------
// Normalization lives in ./normalize (shared with gmoEngine per
// 03_FRONTEND_ARCHITECTURE.md §2). The label variant is used here because this
// engine needs to keep "%" and "." to parse concentrations.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Subcategory detection (config §5) — a validated ctx subcategory wins, then
// keyword signals, then a fallback to toothpaste_gel (the larger category).
// `viaFallback` forces the caller to cap confidence at Medium — the fallback
// guess must never read as High, even with a barcode and an explicit ppm
// (build guide §5 "cap confidence at Medium").
// ---------------------------------------------------------------------------

function detectSubcategory(
  fullText: string,
  ctxSubcategory: string | undefined,
  config: FluorideLookupConfig
): { subcategory: string; viaFallback: boolean } {
  const known = new Set(Object.keys(config.category_ppm_tables))
  if (ctxSubcategory && known.has(ctxSubcategory)) {
    return { subcategory: ctxSubcategory, viaFallback: false }
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

const SUBCATEGORY_FALLBACK_FACTOR =
  "Subcategory guessed — no label keyword and no validated subcategory; fell back to the tooth/gel table"

// ---------------------------------------------------------------------------
// Tier classification (config §6 category_ppm_tables) + confidence scoring
// (config §7)
// ---------------------------------------------------------------------------

function classify(subcat: string, ppm: number, config: FluorideLookupConfig): {
  tier: ResultTier
  row: { verdict: string; guidance?: string }
  label: string
} {
  const table = (config.category_ppm_tables as Record<string, Array<{ ppm_range: number[]; verdict: string; guidance?: string }>>)[subcat]
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
// Compound matching (§4) — scan the normalized text for each compound in the
// config terms table (label order), extract an adjacent percentage/ppm number,
// and fall back to the compound's default ppm when no number is present.
// ---------------------------------------------------------------------------

interface Match {
  term: EngineTerm
  ppm: number
  defaultPpm: boolean
}

function extractMatches(fullText: string, config: FluorideLookupConfig): Match[] {
  const matches: Match[] = []
  for (const row of config.terms_lookup_table) {
    if (!row.regex_pattern) continue
    const re = new RegExp(row.regex_pattern, "i")
    const found = re.exec(fullText)
    if (!found) continue

    const after = fullText.slice(found.index + found[0].length, found.index + found[0].length + 60)
    const directPpm = /(\d+(?:\.\d+)?)\s*ppm(?:\s*f)?/i.exec(after)
    const percentConcentration = /(\d+(?:\.\d+)?)\s*%/i.exec(after)

    let ppm: number
    let defaultPpm: boolean
    if (directPpm) {
      ppm = Number(directPpm[1])
      defaultPpm = false
    } else if (percentConcentration && typeof row.ppm_multiplier === "number") {
      const value = Number(percentConcentration[1])
      const percentTail = after.slice(percentConcentration.index, percentConcentration.index + 40)
      const multiplier = /fluoride\s+ion/i.test(percentTail)
        ? 10000
        : row.ppm_multiplier
      ppm = Math.ceil(value * multiplier)
      defaultPpm = false
    } else {
      ppm = row.default_ppm ?? 0
      defaultPpm = true
    }

    matches.push({
      term: {
        term: found[0],
        normalized: row.normalized_term,
        kind: "active_compound",
        // Publish the ppm the ENGINE actually classified on. The UI gauge used
        // to re-parse the raw label text independently, scanning the whole
        // string while this engine only looks 60 characters past the matched
        // compound — so on a label carrying an unrelated "500 ppm preservative"
        // the tier came from the compound figure while the ring headlined 500.
        // The engine is the single source of truth; the UI renders it.
        // `detail` is the EngineResult field intended for exactly this
        // ("e.g. '0.243%'", 01_TECHNICAL_SPECIFICATION.md §5).
        detail: defaultPpm ? "default ppm for this compound" : `${ppm} ppm`,
      },
      ppm,
      defaultPpm,
    })
  }
  return matches
}

// A ppm figure stated on the pack WITHOUT a named compound.
//
// Every row in terms_lookup_table names a specific salt (sodium fluoride,
// stannous fluoride, …), so a pack that simply declares its own concentration
// — "Fluoride Toothpaste 1450 ppm", "0.32% Sodium Fluoride, 1450 ppm F",
// "1450 ppm fluoride" across the front — could not be read at all when the salt
// name was absent or garbled by OCR, and returned "No Data".
//
// A printed ppm IS the label's own statement of fluoride content
// (Fluoride_Build_Guide.md §2: "Detect the fluoride content per dose as printed
// on the label"). It needs no multiplier and is stronger evidence than the
// default_ppm fallback, so it is recorded with defaultPpm=false.
//
// Deliberately anchored to the word "fluoride", with a bounded, digit-free
// window, so an unrelated "500 ppm preservative" elsewhere on the panel is not
// read as the product's fluoride level. The gap may contain letters — real
// claims read "Fluoride Toothpaste 1450 ppm".
const DIRECT_PPM_PATTERNS = [
  // "…fluoride … 1450 ppm"  (ppm follows the word)
  /fluoride[^0-9]{0,30}(\d+(?:\.\d+)?)\s*ppm/i,
  // "…1450 ppm … fluoride"  (the word follows the ppm)
  /(\d+(?:\.\d+)?)\s*ppm[^0-9]{0,20}fluoride/i,
]

function extractDirectPpmClaim(fullText: string): Match | null {
  for (const pattern of DIRECT_PPM_PATTERNS) {
    const found = pattern.exec(fullText)
    if (!found) continue
    const ppm = Number(found[1])
    if (!Number.isFinite(ppm) || ppm <= 0) continue
    return {
      term: {
        term: found[0].trim(),
        normalized: "stated fluoride concentration",
        kind: "active_compound",
        detail: `${ppm} ppm`,
      },
      ppm,
      defaultPpm: false,
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export const fluorideEngine = (
  ingredientsText: string,
  ctx: EngineContext,
  config: FluorideLookupConfig
): EngineResult => {
  const { fullText } = normalizeLabel(ingredientsText)
  // The front panel is searched too. Fluoride claims are frequently printed
  // there rather than in the ingredient panel — "Fluoride Toothpaste 1450 ppm"
  // across the face of the pack is common, and so is a "Fluoride Free" badge.
  // Restricting matching to the back panel made those products return
  // "No Data", which reads as "the scan failed" rather than "we could not see
  // the active ingredients". FR-1 assigns the front panel "category cues" and
  // the architecture notes that toothpaste/mouthwash usually sits on the front.
  const { fullText: frontText } = normalizeLabel(ctx.packageFrontText ?? "")
  const now = new Date().toISOString()

  // Subcategory routing (§5) — a validated subcategory or a detected keyword
  // routes cleanly; the fallback defaults to tooth/gel and caps confidence at
  // Medium (never High from a guess).
  const { subcategory, viaFallback } = detectSubcategory(
    `${fullText} ${frontText}`,
    ctx.subcategory,
    config
  )

  // Compound matching + ppm conversion (§4/§6).
  //
  // Match each panel independently so a compound and its ppm stay anchored to
  // the text they were printed in. Then prefer the back panel when it yielded a
  // real reading — the ingredient list is authoritative — and fall back to the
  // front only when the back produced nothing quantified.
  const backMatches = extractMatches(fullText, config)
  const frontMatches = frontText ? extractMatches(frontText, config) : []
  const backHasReading = backMatches.some((m) => !m.defaultPpm)
  let matches =
    backHasReading || frontMatches.length === 0
      ? backMatches
      : frontMatches.some((m) => !m.defaultPpm)
        ? frontMatches
        : backMatches.length > 0
          ? backMatches
          : frontMatches

  // Last resort: the pack states a ppm without naming the salt. Only consulted
  // when compound matching produced no quantified reading, so a named compound
  // with its own adjacent figure always wins.
  if (!matches.some((m) => !m.defaultPpm)) {
    const direct =
      extractDirectPpmClaim(frontText) ?? extractDirectPpmClaim(fullText)
    if (direct) matches = [direct]
  }

  const fluorideMatches = matches.filter((m) => !areFluorideFreeFromTerm(m.term))
  const fluorideFreeMatch = matches.find((m) => areFluorideFreeFromTerm(m.term))
  const fluorideFreePattern = /\bfluoride[\s-]*free\b|\bwithout fluoride\b|\bno fluoride\b/i
  const explicitFluorideFreeClaim =
    fluorideFreePattern.test(fullText) || fluorideFreePattern.test(frontText)

  // No recognized active compound is not evidence that the product is fluoride-free.
  if (!fluorideFreeMatch && !explicitFluorideFreeClaim && fluorideMatches.length === 0) {
    return {
      category: "oral_care",
      subcategory,
      result: { tier: "none", label: "No Data" },
      confidence: {
        tier: "low",
        score: 0,
        factors: [
          "No active fluoride compound or explicit fluoride-free claim was recognized",
          ...(ctx.ocrMeanConfidence < OCR_CONFIDENCE_PENALTY_THRESHOLD
            ? [
                `OCR quality — label text read at ${(ctx.ocrMeanConfidence * 100).toFixed(0)}% confidence, below the ${(OCR_CONFIDENCE_PENALTY_THRESHOLD * 100).toFixed(0)}% threshold`,
              ]
            : []),
          ...(viaFallback ? [SUBCATEGORY_FALLBACK_FACTOR] : []),
        ],
      },
      matchedTerms: matches.map((m) => m.term),
      guidance: "Insufficient label text was recognized to assess fluoride content.",
      constraintNotice: FLUORIDE_CONSTRAINT_NOTICE,
      computedAt: now,
      configVersion: config.version,
    }
  }

  // No active fluoride compound at all (e.g. only nano-hydroxyapatite).
  if (fluorideMatches.length === 0 && (fluorideFreeMatch || explicitFluorideFreeClaim)) {
    return {
      category: "oral_care",
      subcategory,
      result: { tier: "none", label: "Fluoride-Free" },
      confidence: fluorideFreeConfidence(
        viaFallback,
        explicitFluorideFreeClaim ? "Explicit fluoride-free label claim detected" : "Only fluoride-free markers present",
        ctx.ocrMeanConfidence
      ),
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
  //  - Product identification (+2)               barcode match only
  //  - Lookup match rate (+1)                    if any compound matched
  //  - Concentration clarity (+1)                if a number was adjacent
  // Totals: 4–5 High, 2–3 Medium, 0–1 Low.
  // NOTE: a default-ppm fallback (no adjacent number) is UNCONDITIONALLY
  // capped at 3 points (Medium) — it can never reach High, even with a full
  // list and a barcode match. A missing concentration always withholds High.
  // A GUESSED subcategory (viaFallback) is capped the same way — High requires
  // a routed subcategory, never a default guessed at runtime.
  let points = 0
  const factors: string[] = []

  if (!ctx.isTruncated) {
    points += 2
    factors.push("Ingredient list completeness — full list OCR'd, no truncation")
  } else {
    factors.push("Ingredient list completeness — list appears truncated")
  }

  // Shared rule across both engines: an exact barcode match confirms identity
  // (+2); a fuzzy name match is recorded but earns no points; `none` earns none.
  if (ctx.identityMatch === "barcode") {
    points += 2
    factors.push("Product identification — barcode matched the verified dataset")
  } else if (ctx.identityMatch === "name") {
    factors.push("Product identification — name match, no barcode confirmation")
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

  if (viaFallback) {
    factors.push(SUBCATEGORY_FALLBACK_FACTOR)
  }

  // OCR-quality penalty (−1, once) — FR-3: "If mean OCR confidence < 0.6, this
  // feeds the confidence scoring as a penalty."
  //
  // This was applied only in the "No Data" branch above, so a normal fluoride
  // verdict ignored it entirely: a label read at 0.36 confidence still scored
  // High. gmoEngine has always applied it on its main path, and the same scan
  // should not be trusted differently just because the product is food rather
  // than oral care.
  if (ctx.ocrMeanConfidence < OCR_CONFIDENCE_PENALTY_THRESHOLD) {
    points -= 1
    factors.push(
      `OCR quality — label text read at ${(ctx.ocrMeanConfidence * 100).toFixed(0)}% confidence, below the ${(OCR_CONFIDENCE_PENALTY_THRESHOLD * 100).toFixed(0)}% threshold`
    )
  }

  const total = primary.defaultPpm || viaFallback ? Math.min(points, 3) : points
  const confTier = total >= 4 ? "high" : total >= 2 ? "medium" : "low"

  const { tier, label, row } = classify(subcategory, primary.ppm, config)

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

// A fluoride-free verdict is a strong, regulated label claim — High unless the
// subcategory itself was guessed, which caps it at Medium (a guess can never
// confirm High). A sub-0.6 OCR read caps it the same way: FR-3 applies to the
// short-circuit too, because a "fluoride-free" marker found in a barely-readable
// label may be a misread.
function fluorideFreeConfidence(
  viaFallback: boolean,
  reason: string,
  ocrMeanConfidence: number
): { tier: "medium" | "high"; score: number; factors: string[] } {
  const lowOcr = ocrMeanConfidence < OCR_CONFIDENCE_PENALTY_THRESHOLD
  const ocrFactor = `OCR quality — label text read at ${(ocrMeanConfidence * 100).toFixed(0)}% confidence, below the ${(OCR_CONFIDENCE_PENALTY_THRESHOLD * 100).toFixed(0)}% threshold`
  if (viaFallback) {
    return {
      tier: "medium",
      score: 3,
      factors: [reason, SUBCATEGORY_FALLBACK_FACTOR, ...(lowOcr ? [ocrFactor] : [])],
    }
  }
  return lowOcr
    ? { tier: "medium", score: 3, factors: [reason, ocrFactor] }
    : { tier: "high", score: 5, factors: [reason] }
}

function areFluorideFreeFromTerm(term: EngineTerm): boolean {
  return !/fluoride|smfp|mfp|monofluorophosphate|amine|olaflur|dectaflur|apf|naf|snf2/i.test(term.term + " " + term.normalized)
}
