import { describe, it, expect } from "vitest"
import { productToEngineResult } from "./fromProduct"
import { GMO_CONSTRAINT_NOTICE } from "./gmoEngine"
import { FLUORIDE_CONSTRAINT_NOTICE } from "./fluorideEngine"
import type { ProductRow } from "@/lib/identification/productIdentification"

function sampleProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    barcode: "5449000000996",
    name: "Uncle Sam Wheat Flakes",
    brand: "Uncle Sam",
    category: "gmo_food",
    subcategory: "cereal",
    ingredients_text: "Whole wheat, wheat bran",
    result_tier: "medium",
    result_label: "Medium GMO Likelihood",
    confidence_tier: "high",
    matched_terms: [
      { term: "wheat", normalized: "wheat", kind: "explicit", detail: "wheat" },
    ],
    guidance_text: "Custom guidance from an admin.",
    config_version: "v1.0",
    ...overrides,
  }
}

function sampleOralCareProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    ...sampleProduct(),
    barcode: "4005800000001",
    name: "Fluoride Daily Toothpaste",
    brand: "Colgate",
    category: "oral_care",
    subcategory: "toothpaste_gel",
    ingredients_text: "Sodium Fluoride 1350 ppm",
    result_tier: "medium",
    result_label: "Standard Fluoride Content",
    confidence_tier: "high",
    matched_terms: [
      { term: "sodium fluoride", normalized: "Sodium Fluoride", kind: "active_compound" },
    ],
    config_version: "v1.3",
    ...overrides,
  }
}

describe("productToEngineResult — FR-6 stored verdict mapping", () => {
  it("maps a stored row into the exact EngineResult shape", () => {
    const result = productToEngineResult(sampleProduct(), "barcode")

    expect(result.category).toBe("gmo_food")
    expect(result.subcategory).toBe("cereal")
    expect(result.result).toEqual({ tier: "medium", label: "Medium GMO Likelihood" })
    expect(result.confidence.tier).toBe("high")
    expect(result.confidence.score).toBe(4)
    expect(result.matchedTerms).toEqual([
      { term: "wheat", normalized: "wheat", kind: "explicit", detail: "wheat" },
    ])
    expect(result.guidance).toBe("Custom guidance from an admin.")
    expect(result.configVersion).toBe("v1.0")
    expect(typeof result.computedAt).toBe("string")
  })

  it("describes barcode provenance in the confidence factors", () => {
    const result = productToEngineResult(sampleProduct(), "barcode")
    expect(result.confidence.factors[0]).toContain("barcode")
  })

  it("describes name-match provenance", () => {
    const result = productToEngineResult(sampleProduct(), "name")
    expect(result.confidence.factors[0]).toContain("name")
  })

  it("falls back to the GMO constraint notice when guidance_text is missing", () => {
    const result = productToEngineResult(sampleProduct({ guidance_text: null }), "barcode")
    expect(result.guidance).toContain("cannot confirm GMO content")
    expect(result.constraintNotice).toBe(result.guidance)
  })

  it("uses the fluoride constraint notice for oral_care products", () => {
    const result = productToEngineResult(sampleOralCareProduct(), "barcode")
    expect(result.category).toBe("oral_care")
    expect(result.constraintNotice).toBe(FLUORIDE_CONSTRAINT_NOTICE)
    expect(result.constraintNotice).not.toBe(GMO_CONSTRAINT_NOTICE)
  })

  it("falls back to the fluoride constraint notice when guidance_text is missing on oral_care", () => {
    const result = productToEngineResult(sampleOralCareProduct({ guidance_text: null }), "barcode")
    expect(result.guidance).toBe(FLUORIDE_CONSTRAINT_NOTICE)
    expect(result.constraintNotice).toBe(FLUORIDE_CONSTRAINT_NOTICE)
  })

  it("normalizes a 'none' confidence tier down to low without throwing", () => {
    const result = productToEngineResult(sampleProduct({ confidence_tier: "none" }), "name")
    expect(result.confidence.tier).toBe("low")
    expect(result.confidence.score).toBe(1)
  })

  it("normalizes a 'none' result tier to low for the UI", () => {
    const result = productToEngineResult(
      sampleProduct({ result_tier: "none", result_label: "No GMO Likelihood" }),
      "none"
    )
    expect(result.result.tier).toBe("low")
  })

  it("drops malformed entries in matched_terms instead of crashing", () => {
    const result = productToEngineResult(
      sampleProduct({
        matched_terms: [
          { term: "good", normalized: "good", kind: "explicit" },
          "garbage",
          { term: 42 },
          null,
          { term: "badkind", normalized: "x", kind: "not_a_kind" },
        ],
      } as unknown as Partial<ProductRow>),
      "name"
    )
    expect(result.matchedTerms).toHaveLength(1)
    expect(result.matchedTerms[0].term).toBe("good")
  })
})