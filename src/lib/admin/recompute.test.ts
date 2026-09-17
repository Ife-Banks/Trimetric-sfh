import { describe, it, expect } from "vitest"
import {
  composeScoringText,
  rebuildEngineContext,
  recomputeVerdict,
  type SubmissionForReview,
} from "./recompute"

function sampleSubmission(overrides: Partial<SubmissionForReview> = {}): SubmissionForReview {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    category: "gmo_food",
    subcategory: "cereal",
    product_name: "Test Cereal",
    brand: "TestBrand",
    barcode: null,
    ingredients_text: "Cassava, water",
    certification_text: null,
    concentration_text: null,
    photo_path: "pending/6f1c0f0e-1234-4abc-9def-000000000000.jpg",
    ocr_confidence: 72,
    engine_preview: null,
    created_at: "2026-09-16T00:00:00.000Z",
    ...overrides,
  }
}

describe("rebuildEngineContext — what the recompute assumes", () => {
  it("uses the stored OCR confidence and the low-confidence-path identity context", () => {
    const ctx = rebuildEngineContext(sampleSubmission({ ocr_confidence: 55 }))
    expect(ctx.ocrMeanConfidence).toBe(55)
    expect(ctx.isTruncated).toBe(false)
    expect(ctx.identityMatch).toBe("none")
    expect(ctx.category).toBe("gmo_food")
    expect(ctx.subcategory).toBe("cereal")
  })

  it("defaults a missing OCR confidence to 0 and fills a missing subcategory", () => {
    const ctx = rebuildEngineContext(sampleSubmission({ ocr_confidence: null, subcategory: null }))
    expect(ctx.ocrMeanConfidence).toBe(0)
    expect(ctx.subcategory).toBe("packaged_food")
  })
})

describe("composeScoringText — certification folds into the scored text", () => {
  it("returns the ingredients unchanged when nothing is certified", () => {
    expect(composeScoringText("Cassava, water", "")).toBe("Cassava, water")
    expect(composeScoringText("Cassava, water", "None visible")).toBe("Cassava, water")
  })

  it("appends a detected certification so the engine short-circuit can see it", () => {
    expect(composeScoringText("Cassava, water", "Certified Organic")).toBe(
      "Cassava, water, Certified Organic"
    )
  })

  it("handles an empty ingredients text with only a certification", () => {
    expect(composeScoringText("  ", "Certified Organic")).toBe("Certified Organic")
  })
})

describe("recomputeVerdict — admin preview is the real engine output", () => {
  it("runs the gmo engine and returns a full EngineResult", () => {
    const result = recomputeVerdict("Soy lecithin, corn syrup", null, sampleSubmission())
    expect(result).not.toBeNull()
    expect(result?.category).toBe("gmo_food")
    expect(result?.result.tier).toBeDefined()
    expect(result?.configVersion).toBeTruthy()
  })

  it("a detected certification short-circuits to the lowest tier", () => {
    const result = recomputeVerdict("Soy lecithin, corn syrup", "Certified Organic", sampleSubmission())
    expect(result?.result.tier).toBe("low")
    expect(result?.matchedTerms.some((t) => t.kind === "certification")).toBe(true)
  })

  it("returns null for oral-care submissions (Phase 6 engine not wired)", () => {
    const result = recomputeVerdict("Sodium fluoride", null, sampleSubmission({ category: "oral_care" }))
    expect(result).toBeNull()
  })
})