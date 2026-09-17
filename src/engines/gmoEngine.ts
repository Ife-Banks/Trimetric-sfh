import config from "../../data/gmo_lookup_config_v1.0.json"
import type { EngineContext, EngineResult, EngineTerm } from "./types"

// Shared engine types live in ./types so VerdictScreen and the stored-verdict
// mapper (./fromProduct) can import the EngineResult surface without depending
// on this module. Re-exported here to keep earlier imports working.
export type {
  Engine,
  EngineContext,
  EngineResult,
  EngineTerm,
  ResultTier,
  VerdictTier,
} from "./types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONSTRAINT_NOTICE =
  "This estimates likelihood from the ingredients listed. It cannot confirm GMO content — only lab testing can."

export { CONSTRAINT_NOTICE as GMO_CONSTRAINT_NOTICE }

// ---------------------------------------------------------------------------
// Normalization — lowercase, strip punctuation, split on commas into tokens
// ---------------------------------------------------------------------------

function normalize(text: string): { fullText: string; tokens: string[] } {
  let s = text.trim()
  // Drop a leading "ingredients" header (e.g. "Ingredients: corn syrup, salt")
  s = s.replace(/^\s*ingredients\s*[:.]\s*/i, "")
  const fullText = s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim()
  const tokens = s
    .split(",")
    .map((t) => t.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim())
    .filter((t) => t.length > 0)
  return { fullText, tokens }
}

// ---------------------------------------------------------------------------
// Classification — explicit > ambiguous > low_risk, driven by the lookup config
// ---------------------------------------------------------------------------

type Classification =
  | { kind: "explicit"; family: string }
  | { kind: "ambiguous"; family: null }
  | { kind: "low_risk"; family: null }
  | { kind: "unknown"; family: null }

function classifyToken(token: string): Classification {
  for (const entry of config.explicit_crop_matches.entries) {
    for (const alias of entry.aliases) {
      if (token.includes(alias.toLowerCase())) {
        return { kind: "explicit", family: entry.crop_family }
      }
    }
  }
  for (const entry of config.ambiguous_derivative_matches.entries) {
    if (token.includes(entry.ingredient.toLowerCase())) {
      return { kind: "ambiguous", family: null }
    }
  }
  for (const lowRisk of config.low_risk_tokens) {
    if (token.includes(lowRisk.toLowerCase())) {
      return { kind: "low_risk", family: null }
    }
  }
  return { kind: "unknown", family: null }
}

// ---------------------------------------------------------------------------
// Confidence scoring (points). Ambiguous penalty applies ONCE per product when
// ambiguous matches exist with no explicit crop found elsewhere.
// ---------------------------------------------------------------------------

function scoreConfidence(
  ctx: EngineContext,
  explicitCropCount: number,
  ambiguousCount: number,
  recognizedRatio: number
): { points: number; factors: string[] } {
  let points = 0
  const factors: string[] = []

  // Ingredient list completeness (+2)
  if (!ctx.isTruncated) {
    points += 2
    factors.push("Ingredient list completeness — full list OCR'd, no visible truncation")
  } else {
    factors.push("Ingredient list completeness — list appears truncated")
  }

  // Product identification (+2, barcode only)
  if (ctx.identityMatch === "barcode") {
    points += 2
    factors.push("Product identification — barcode matched an Open Food Facts entry")
  } else if (ctx.identityMatch === "name") {
    factors.push("Product identification — name match, no barcode confirmation")
  } else {
    factors.push("Product identification — none")
  }

  // Lookup match rate (+1), only meaningful once an explicit crop is found
  if (explicitCropCount >= 1 && recognizedRatio >= 0.8) {
    points += 1
    factors.push("Lookup match rate — ≥80% of extracted ingredients recognized")
  }

  // Certification clarity (+1), only on a full, non-truncated read with a real crop signal
  if (!ctx.isTruncated && explicitCropCount >= 1) {
    points += 1
    factors.push("Certification clarity — cert statement clearly readable either way")
  }

  // Ambiguous-derivative penalty (−1, once) when ambiguous matches exist with no explicit crop
  if (ambiguousCount > 0 && explicitCropCount === 0) {
    points -= 1
    factors.push(
      "Ambiguous-derivative penalty — ambiguous derivatives matched with no explicit crop found elsewhere"
    )
  }

  return { points, factors }
}

function tierFromPoints(points: number): "low" | "medium" | "high" {
  if (points >= 4) return "high"
  if (points >= 2) return "medium"
  return "low"
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function gmoEngine(ingredientsText: string, ctx: EngineContext): EngineResult {
  const { fullText, tokens } = normalize(ingredientsText)
  const now = new Date().toISOString()

  // 1. Certification short-circuit — check FIRST
  const certTerms = config.certification_short_circuit.terms.map((t) => t.toLowerCase())
  const matchedCertTerm = certTerms.find((term) => fullText.includes(term))

  if (matchedCertTerm) {
    return {
      category: "gmo_food",
      subcategory: "packaged_food",
      result: { tier: "low", label: "Low GMO Likelihood" },
      confidence: {
        tier: "high",
        score: 5,
        factors: [
          "Ingredient list completeness — full list OCR'd, no visible truncation",
          "Certification clarity — certification statement present and clearly readable",
        ],
      },
      matchedTerms: [
        { term: matchedCertTerm, normalized: matchedCertTerm, kind: "certification", detail: "certified organic / non-GMO" },
      ],
      guidance: CONSTRAINT_NOTICE,
      constraintNotice: CONSTRAINT_NOTICE,
      computedAt: now,
      configVersion: config.version,
    }
  }

  // 2. Match each token against the lookup table
  const explicitFamilies: Set<string> = new Set()
  let ambiguousCount = 0
  let recognizedCount = 0
  const matchedTerms: EngineTerm[] = []

  for (const token of tokens) {
    const classification = classifyToken(token)
    if (classification.kind === "explicit") {
      explicitFamilies.add(classification.family)
      recognizedCount++
      matchedTerms.push({
        term: token,
        normalized: classification.family,
        kind: "explicit",
        detail: classification.family,
      })
    } else if (classification.kind === "ambiguous") {
      ambiguousCount++
      recognizedCount++
      matchedTerms.push({
        term: token,
        normalized: "ambiguous derivative",
        kind: "ambiguous",
        detail: "may derive from a GMO crop, source not disclosed on label",
      })
    } else if (classification.kind === "low_risk") {
      recognizedCount++
    }
  }

  // 3. Likelihood from distinct crop family count (N)
  const N = explicitFamilies.size
  const resultTier: "low" | "medium" | "high" = N === 0 ? "low" : N === 1 ? "medium" : "high"
  const resultLabel =
    N === 0 ? "Low GMO Likelihood" : N === 1 ? "Medium GMO Likelihood" : "High GMO Likelihood"

  // 4. Confidence
  const recognizedRatio = tokens.length > 0 ? recognizedCount / tokens.length : 0
  const { points, factors } = scoreConfidence(ctx, explicitFamilies.size, ambiguousCount, recognizedRatio)

  return {
    category: "gmo_food",
    subcategory: "packaged_food",
    result: { tier: resultTier, label: resultLabel },
    confidence: { tier: tierFromPoints(points), score: points, factors },
    matchedTerms,
    guidance: CONSTRAINT_NOTICE,
    constraintNotice: CONSTRAINT_NOTICE,
    computedAt: now,
    configVersion: config.version,
  }
}