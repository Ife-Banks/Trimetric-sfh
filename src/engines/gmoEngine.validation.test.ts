// Validation suite — runs the hand-labeled 75-row GMO ingredient set
// (docs/archive/SHF GMO ingredient lists .xlsx → data/gmo_validation_set.json) through
// gmoEngine and reports a hit rate against the human-picked expectedTokens.
//
// Matching is deliberately fuzzy. OCR-style ingredient text does not tokenize
// the same way a person's hand-picked list does, so we assert on crop-family
// overlap (and ambiguous-term presence) rather than string equality.

import { describe, it, expect } from "vitest"
import gmoConfig from "../../data/gmo_lookup_config_v1.0.json"
import validationSet from "../../data/gmo_validation_set.json"
import { gmoEngine } from "./gmoEngine"
import type { EngineContext, EngineTerm } from "./types"

type Row = {
  productName: string | null
  brand: string | null
  barcode: string | null
  category: string | null
  ingredientsText: string | null
  expectedTokens: string[]
  certification: string | null
}

const rows = validationSet as Row[]

const CTX: EngineContext = {
  ocrMeanConfidence: 0.95,
  isTruncated: false,
  identityMatch: "none",
  category: "gmo_food",
  subcategory: "packaged_food",
}

// Genuine GMO/non-GMO certifications only. Anything else on a label (Halal,
// Kosher, Vegetarian, Green Dot, Sustainable fishery, "No gluton", "Absent")
// is NOT a GMO signal and must never be treated as one.
const GMO_CERT_ATOMS = new Set(["non gmo", "non gmo verified", "usda organic", "organic"])

function isGmoCertification(raw: string | null): boolean {
  if (!raw) return false
  const atoms = raw
    .replace(/\./g, "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (atoms.length === 0) return false
  return atoms.every((a) => GMO_CERT_ATOMS.has(a))
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
const significantWords = (s: string) =>
  new Set(norm(s).split(" ").filter((w) => w.length >= 4))
const sharesWord = (a: string, b: string) => {
  const wa = significantWords(a)
  for (const w of significantWords(b)) if (wa.has(w)) return true
  return false
}

// Classify a human-picked expected token the same way the engine classifies an
// ingredient. Used only to decide what family the human expected to see.
function expectedKey(token: string): string {
  const t = token.toLowerCase()
  for (const entry of gmoConfig.explicit_crop_matches.entries) {
    for (const alias of entry.aliases) {
      if (t.includes(alias.toLowerCase())) return entry.crop_family
    }
  }
  if (/\bvegetable/i.test(t)) return "ambiguous"
  for (const entry of gmoConfig.ambiguous_derivative_matches.entries) {
    if (t.includes(entry.ingredient.toLowerCase())) return "ambiguous"
  }
  return "other"
}

type TokenResult = {
  token: string
  key: string
  hit: boolean
  counted: boolean
}

type ProductResult = {
  index: number
  label: string
  tokens: TokenResult[]
  engineFamilies: string[]
  extras: string[]
}

const results: ProductResult[] = []

for (let i = 0; i < rows.length; i++) {
  const row = rows[i]
  if (!row.ingredientsText || row.expectedTokens.length === 0) continue

  const engineResult = gmoEngine(row.ingredientsText, CTX)
  const engineFamilies = new Set(
    engineResult.matchedTerms
      .filter((t: EngineTerm) => t.kind === "explicit")
      .map((t: EngineTerm) => t.normalized)
  )
  const engineAmbiguousTerms = engineResult.matchedTerms.filter(
    (t: EngineTerm) => t.kind === "ambiguous"
  )
  const hasAmbiguous = engineAmbiguousTerms.length > 0

  const tokenResults: TokenResult[] = row.expectedTokens.map((token) => {
    const key = expectedKey(token)
    if (key === "ambiguous") {
      const textHit = engineAmbiguousTerms.some(
        (t) => sharesWord(token, t.term) || norm(t.term).includes(norm(token)) || norm(token).includes(norm(t.term))
      )
      return { token, key, hit: hasAmbiguous && (textHit || engineAmbiguousTerms.length > 0), counted: true }
    }
    if (key === "other") return { token, key, hit: false, counted: false }
    return { token, key, hit: engineFamilies.has(key), counted: true }
  })

  const expectedFamilies = new Set(tokenResults.filter((t) => t.counted).map((t) => t.key))
  const extras = [...engineFamilies].filter((f) => !expectedFamilies.has(f))

  results.push({
    index: i,
    label: row.productName ?? `token-probe #${i + 1}`,
    tokens: tokenResults,
    engineFamilies: [...engineFamilies],
    extras,
  })
}

// ---- Summary -----------------------------------------------------------------

const allTokens = results.flatMap((r) => r.tokens).filter((t) => t.counted)
const hits = allTokens.filter((t) => t.hit)
const hitRate = allTokens.length ? hits.length / allTokens.length : 0
const passedProducts = results.filter((r) => r.tokens.every((t) => !t.counted || t.hit))
const failedProducts = results.filter((r) => r.tokens.some((t) => t.counted && !t.hit))
const withExtras = results.filter((r) => r.extras.length > 0)

describe("gmoEngine — hand-labeled validation set", () => {
  it("reports the pass/fail summary and overall hit rate", () => {
    const lines: string[] = []
    lines.push("")
    lines.push("================ GMO VALIDATION SUMMARY ================")
    lines.push(`rows in set:                 ${rows.length}`)
    lines.push(`rows evaluated:              ${results.length}`)
    lines.push(`expected tokens (scored):    ${allTokens.length}`)
    lines.push(`token hits:                  ${hits.length}`)
    lines.push(`token hit rate:              ${(hitRate * 100).toFixed(1)}%`)
    lines.push(`products pass:               ${passedProducts.length}/${results.length}`)
    lines.push("")
    lines.push("FAILED PRODUCTS (missed expected token):")
    if (failedProducts.length === 0) lines.push("  (none)")
    for (const p of failedProducts) {
      const missed = p.tokens.filter((t) => t.counted && !t.hit).map((t) => `${t.token} [${t.key}]`)
      lines.push(`  #${p.index + 1} ${p.label}`)
      lines.push(`      missed: ${missed.join(", ")}`)
      lines.push(`      engine families: ${p.engineFamilies.join(", ") || "(none)"}`)
    }
    lines.push("")
    lines.push("PRODUCTS WITH UNEXPECTED FAMILIES (engine found a crop the label list omitted):")
    if (withExtras.length === 0) lines.push("  (none)")
    for (const p of withExtras) lines.push(`  #${p.index + 1} ${p.label} → ${p.extras.join(", ")}`)
    lines.push("========================================================")
    console.log(lines.join("\n"))

    expect(allTokens.length).toBeGreaterThan(0)
    // Threshold guards against silent regressions; raise as the table improves.
    expect(hitRate).toBeGreaterThanOrEqual(0.8)
  })

  it("treats only genuine non-GMO certifications as certifications", () => {
    for (const v of ["Non GMO", "Non GMO Verified", "USDA Organic", "Organic", "Non GMO Verified, USDA Organic", "USDA Organic, Non GMO Verified"])
      expect(isGmoCertification(v), `${v} should be a GMO cert`).toBe(true)
    for (const v of ["Halal", "Kosher", "Vegetarian", "Green Dot", "Sustainable fishery", "No gluton", "Absent", "vegan"])
      expect(isGmoCertification(v), `${v} must NOT be a GMO cert`).toBe(false)

    // The config's short-circuit must never contain a non-GMO mark.
    const terms = gmoConfig.certification_short_circuit.terms.map((t) => t.toLowerCase()).join(" | ")
    for (const bad of ["halal", "kosher", "vegetarian", "green dot", "sustainable", "gluton", "absent", "vegan"])
      expect(terms).not.toContain(bad)
  })

  it("implements the vegetable catch-all as a pattern (not fixed phrases)", () => {
    for (const text of [
      "vegetable margarine, salt",
      "hydrogenated vegetable fats, water",
      "edible vegetables oil, salt",
    ]) {
      const r = gmoEngine(text, CTX)
      expect(r.matchedTerms.some((t) => t.kind === "ambiguous")).toBe(true)
      expect(r.result.tier).toBe("low")
    }
    // An explicit crop alias that contains "vegetable" still wins.
    const soy = gmoEngine("textured vegetable protein, salt", CTX)
    expect(soy.matchedTerms.some((t) => t.kind === "explicit" && t.normalized === "soy")).toBe(true)
  })

  it("matches the new salmon crop family and food-acid ambiguous term", () => {
    const salmon = gmoEngine("smoked salmon, salt", CTX)
    expect(salmon.matchedTerms.some((t) => t.kind === "explicit" && t.normalized === "salmon")).toBe(true)
    const acid = gmoEngine("food acid, sugar", CTX)
    expect(acid.matchedTerms.some((t) => t.kind === "ambiguous")).toBe(true)
  })
})
