import type { GmoLookupConfig } from "@/lib/config/lookupConfig"
import {
  NAME_MATCH_STRONG,
  OCR_CONFIDENCE_PENALTY_THRESHOLD,
  tierFromPoints,
} from "./constants"
import { normalizeIngredients } from "./normalize"
import type { EngineContext, EngineResult, EngineTerm } from "./types"

// Shared engine types live in ./types so the stored-verdict mapper
// (./fromProduct) can import the EngineResult surface without depending on
// this module. Re-exported here to keep earlier imports working.
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
// Normalization lives in ./normalize (shared with fluorideEngine per
// 03_FRONTEND_ARCHITECTURE.md §2).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Classification — explicit > ambiguous > low_risk, driven by the lookup config
// ---------------------------------------------------------------------------

type Classification =
  | { kind: "explicit"; families: string[] }
  | { kind: "ambiguous"; families: [] }
  | { kind: "low_risk"; families: [] }
  | { kind: "unknown"; families: [] }

function classifyToken(token: string, config: GmoLookupConfig): Classification {
  // A single comma-delimited token can name MORE THAN ONE crop. Real labels do
  // this constantly — "SOYBEAN AND/OR CANOLA OIL", "vegetable oil (soybean and
  // corn)". Returning on the first alias match silently dropped every crop
  // family after the first, understating N and therefore the likelihood tier:
  // Honey Maid Grahams scored Medium (soy) when it declares soy AND canola.
  // Collect every distinct family the token matches.
  const families = new Set<string>()
  for (const entry of config.explicit_crop_matches.entries) {
    for (const alias of entry.aliases) {
      if (token.includes(alias.toLowerCase())) {
        families.add(entry.crop_family)
        break
      }
    }
  }
  if (families.size > 0) return { kind: "explicit", families: [...families] }

  // Spec-mandated catch-all (GMO_Build_Guide §3.3): any unspecified
  // "vegetable [X]" term is ambiguous. Enforced as a pattern, not a fixed
  // phrase, because the space of real labels is open-ended ("vegetable
  // margarine", "hydrogenated vegetable fats", "edible vegetables oil").
  // Explicit aliases that contain the word (e.g. "textured vegetable protein"
  // → soy) matched above and take precedence.
  if (/\bvegetable/i.test(token)) {
    return { kind: "ambiguous", families: [] }
  }
  for (const entry of config.ambiguous_derivative_matches.entries) {
    if (token.includes(entry.ingredient.toLowerCase())) {
      return { kind: "ambiguous", families: [] }
    }
  }
  for (const lowRisk of config.low_risk_tokens) {
    if (token.includes(lowRisk.toLowerCase())) {
      return { kind: "low_risk", families: [] }
    }
  }
  return { kind: "unknown", families: [] }
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

  // Product identification: strong name matches support confidence; borderline
  // matches contribute less and are separately capped when using a stored row.
  if (ctx.identityMatch === "barcode") {
    points += 2
    factors.push("Product identification — barcode matched the product catalogue")
  } else if (ctx.identityMatch === "name") {
    if ((ctx.identitySimilarity ?? 0) >= NAME_MATCH_STRONG) {
      points += 2
      factors.push("Product identification — strong product-name match")
    } else {
      points += 1
      factors.push("Product identification — tentative product-name match")
    }
  } else {
    factors.push("Product identification — none")
  }

  // Lookup match rate (+1) — based on the recognition rate alone, independent
  // of whether an explicit crop was found.
  if (recognizedRatio >= 0.8) {
    points += 1
    factors.push("Lookup match rate — ≥80% of extracted ingredients recognized")
  }

  // Certification clarity (+1) — based on OCR completeness alone: a full,
  // non-truncated read is informative whether or not a crop was found.
  if (!ctx.isTruncated) {
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

  // OCR-quality penalty (−1, once) — FR-3: "If mean OCR confidence < 0.6,
  // this feeds the confidence scoring as a penalty." Applied once per product,
  // not once per match, for the same reason as the penalty above: it is one
  // fact about how reliably the label was read.
  if (ctx.ocrMeanConfidence < OCR_CONFIDENCE_PENALTY_THRESHOLD) {
    points -= 1
    factors.push(
      `OCR quality — label text read at ${(ctx.ocrMeanConfidence * 100).toFixed(0)}% confidence, below the ${(OCR_CONFIDENCE_PENALTY_THRESHOLD * 100).toFixed(0)}% threshold`
    )
  }

  return { points, factors }
}

// ---------------------------------------------------------------------------
// Guidance — the plain-language "why it matters" (GMO_Build_Guide.md §7/§8).
// This must describe THIS product, not restate the constraint notice; the
// constraint notice has its own dedicated, non-dismissible slot on screen.
// ---------------------------------------------------------------------------

function humanList(items: string[]): string {
  if (items.length === 0) return ""
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`
}

function buildGuidance(
  families: string[],
  explicitTerms: string[],
  ambiguousTerms: string[],
  confidenceTier: "low" | "medium" | "high"
): string {
  const parts: string[] = []

  if (families.length === 0) {
    parts.push(
      "No ingredients commonly derived from genetically modified crops were found on this label."
    )
  } else {
    parts.push(
      `${families.length === 1 ? "1 crop family" : `${families.length} crop families`} detected — ${humanList(families)} — from ${humanList(explicitTerms.slice(0, 3))}.`
    )
  }

  if (ambiguousTerms.length > 0) {
    parts.push(
      `${humanList(ambiguousTerms.slice(0, 3))} could not be traced to a source crop because the label doesn't say which one.`
    )
  }

  if (confidenceTier === "low") {
    parts.push(
      "The label text was read with limited reliability, so confirm this against the packaging."
    )
  }

  return parts.join(" ")
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function gmoEngine(
  ingredientsText: string,
  ctx: EngineContext,
  config: GmoLookupConfig
): EngineResult {
  const { fullText, tokens } = normalizeIngredients(ingredientsText)
  const now = new Date().toISOString()

  // 1. Certification short-circuit — check FIRST
  //
  // Search the ingredient panel AND the front label. FR-1 assigns certification
  // marks to the front panel, so on real packaging the seal sits next to the
  // brand name and never appears inside the ingredient list. Checking only the
  // ingredients text meant a USDA Organic granola still scored on its soybean
  // oil and came back "Medium GMO Likelihood" — the opposite of what
  // GMO_Build_Guide.md §3.1 mandates ("A certification is stronger evidence than
  // any ingredient match — don't let ingredient scoring override it").
  const certTerms = config.certification_short_circuit.terms.map((t) => t.toLowerCase())
  const frontText = normalizeIngredients(ctx.packageFrontText ?? "").fullText
  const haystack = `${fullText} ${frontText}`.trim()
  const matchedCertTerm = certTerms.find((term) => haystack.includes(term))
  const certSource = matchedCertTerm
    ? frontText.includes(matchedCertTerm)
      ? "front label"
      : "ingredient list"
    : null

  if (matchedCertTerm) {
    // FR-3 applies to the short-circuit too. The certification is only as
    // trustworthy as the read that found it: a seal "found" in text OCR'd at
    // 0.3 confidence may be a misread, so a sub-0.6 scan caps this at Medium
    // instead of reporting High straight off the stored claim. With a clean
    // read (the common case) nothing changes.
    const lowOcr = ctx.ocrMeanConfidence < OCR_CONFIDENCE_PENALTY_THRESHOLD
    return {
      category: "gmo_food",
      subcategory: "packaged_food",
      result: { tier: "low", label: "Low GMO Likelihood" },
      confidence: {
        tier: lowOcr ? "medium" : "high",
        score: lowOcr ? 3 : 5,
        factors: [
          "Ingredient list completeness — full list OCR'd, no visible truncation",
          "Certification clarity — certification statement present and clearly readable",
          ...(lowOcr
            ? [
                `OCR quality — label text read at ${(ctx.ocrMeanConfidence * 100).toFixed(0)}% confidence, below the ${(OCR_CONFIDENCE_PENALTY_THRESHOLD * 100).toFixed(0)}% threshold`,
              ]
            : []),
        ],
      },
      matchedTerms: [
        { term: matchedCertTerm, normalized: matchedCertTerm, kind: "certification", detail: `certified organic / non-GMO (${certSource})` },
      ],
      guidance: `A "${matchedCertTerm}" certification was found on the ${certSource}. That is stronger evidence than any ingredient match, so ingredient scoring was skipped.`,
      constraintNotice: CONSTRAINT_NOTICE,
      computedAt: now,
      configVersion: config.version,
    }
  }

  // 2. Match each token against the lookup table
  const explicitFamilies: Set<string> = new Set()
  const ambiguousTerms: string[] = []
  const explicitTerms: string[] = []
  let ambiguousCount = 0
  let recognizedCount = 0
  const matchedTerms: EngineTerm[] = []

  for (const token of tokens) {
    const classification = classifyToken(token, config)
    if (classification.kind === "explicit") {
      for (const family of classification.families) explicitFamilies.add(family)
      // Recognised once per TOKEN, not once per family — the ratio measures
      // "did we understand this ingredient line", not how many crops it names.
      recognizedCount++
      if (!explicitTerms.includes(token)) explicitTerms.push(token)
      for (const family of classification.families) {
        matchedTerms.push({
          term: token,
          normalized: family,
          kind: "explicit",
          detail: family,
        })
      }
    } else if (classification.kind === "ambiguous") {
      ambiguousCount++
      recognizedCount++
      if (!ambiguousTerms.includes(token)) ambiguousTerms.push(token)
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
  const confidenceTier = tierFromPoints(points)

  return {
    category: "gmo_food",
    subcategory: "packaged_food",
    result: { tier: resultTier, label: resultLabel },
    confidence: { tier: confidenceTier, score: points, factors },
    matchedTerms,
    guidance: buildGuidance(
      [...explicitFamilies],
      explicitTerms,
      ambiguousTerms,
      confidenceTier
    ),
    constraintNotice: CONSTRAINT_NOTICE,
    computedAt: now,
    configVersion: config.version,
  }
}
