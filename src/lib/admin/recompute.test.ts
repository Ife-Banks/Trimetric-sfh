import { describe, it, expect } from "vitest"
import gmoConfig from "../../../data/gmo_lookup_config_v1.0.json"
import fluorideConfig from "../../../data/fluoride_lookup_config_v1.3.json"
import {
  composeScoringText,
  rebuildEngineContext,
  recomputeVerdict,
  type SubmissionForReview,
} from "./recompute"

function scoreSubmission(
  ingredients: string,
  certification: string | null,
  submission: SubmissionForReview,
  concentration?: string | null
) {
  const config = submission.category === "oral_care" ? fluorideConfig : gmoConfig
  return recomputeVerdict(ingredients, certification, submission, config, concentration)
}

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
    ocr_confidence: 0.72,
    engine_preview: null,
    created_at: "2026-09-16T00:00:00.000Z",
    ...overrides,
  }
}

describe("rebuildEngineContext — what the recompute assumes", () => {
  it("uses the stored OCR confidence and the low-confidence-path identity context", () => {
    // ocr_confidence is stored 0-1 (submissionPayloadSchema enforces
    // min(0).max(1)); it must be passed through unscaled, because
    // EngineContext.ocrMeanConfidence is documented 0-1 too.
    const ctx = rebuildEngineContext(sampleSubmission({ ocr_confidence: 0.55 }))
    expect(ctx.ocrMeanConfidence).toBe(0.55)
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
    const result = scoreSubmission("Soy lecithin, corn syrup", null, sampleSubmission())
    expect(result).not.toBeNull()
    expect(result?.category).toBe("gmo_food")
    expect(result?.result.tier).toBeDefined()
    expect(result?.configVersion).toBeTruthy()
  })

  it("a detected certification short-circuits to the lowest tier", () => {
    const result = scoreSubmission("Soy lecithin, corn syrup", "Certified Organic", sampleSubmission())
    expect(result?.result.tier).toBe("low")
    expect(result?.matchedTerms.some((t) => t.kind === "certification")).toBe(true)
  })

  it("runs the fluoride engine for oral-care submissions", () => {
    const result = scoreSubmission("Sodium fluoride 1450 ppm", null, sampleSubmission({ category: "oral_care" }))
    expect(result).not.toBeNull()
    expect(result?.category).toBe("oral_care")
    expect(result?.result.tier).toBeDefined()
    expect(result?.configVersion).toBeTruthy()
  })

  it("runs the fluoride engine with the submitted subcategory and concentration", () => {
    const result = scoreSubmission(
      "Sodium fluoride",
      null,
      sampleSubmission({
        category: "oral_care",
        subcategory: "toothpaste_gel",
        concentration_text: "0.24%",
      })
    )
    expect(result?.category).toBe("oral_care")
    expect(result?.subcategory).toBe("toothpaste_gel")
    // 1450 ppm-equivalent concentration → the stored/derived marker is used, not
    // the default-ppm guess, so confidence is not capped at Medium by the
    // default fallback.
    expect(["medium", "high"]).toContain(result?.confidence.tier)
  })
})
