import { describe, it, expect, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// TEST SUITE — gmoEngine likelihood + confidence scoring (real engine)
// Tests import the real function; gmoEngine.ts has not been written yet,
// so compilation will fail until it is implemented. This is intentional.
// ---------------------------------------------------------------------------

// The real engine signature: (ingredientsText: string, ctx: EngineContext) => EngineResult
import { gmoEngine } from "./gmoEngine"

// EngineContext shape — defined in 06_AGENT_CONTEXT.md §5 and
// 01_TECHNICAL_SPECIFICATION.md §5.1. Fields: ocrMeanConfidence (number, 0–1
// from Tesseract), isTruncated (boolean, OCR cut-off flag), identityMatch
// ('barcode'|'name'|'none'), category, subcategory. These are supplied by the
// real gmoEngine.ts; tests construct ctx literal objects matching its type.

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------

describe("gmoEngine — likelihood + confidence scoring (real engine output)", () => {
  beforeEach(() => {
    // no-op placeholder
  })

  // --- 1. Certified organic short-circuit ---
  describe("certified organic short-circuit", () => {
    it("returns Low likelihood + High confidence when a certification term is present", () => {
      const result = gmoEngine(
        "ingredients: Non-GMO Project Verified corn syrup, salt",
        {
          ocrMeanConfidence: 0.9,
          isTruncated: false,
          identityMatch: "name",
          category: "gmo_food",
          subcategory: "packaged_food",
        }
      )
      expect(result.result.tier).toBe("low")
      expect(result.confidence.tier).toBe("high")
      expect(result.constraintNotice).toContain("cannot confirm GMO content")
    })
  })

  // --- 2. N=0, N=1, N=2+ likelihood tiers ---
  describe("likelihood tiers from distinct crop families", () => {
    it("returns Low likelihood when no explicit crop families matched (N=0)", () => {
      const result = gmoEngine(
        "ingredients: salt, water, vinegar",
        {
          ocrMeanConfidence: 0.9,
          isTruncated: false,
          identityMatch: "name",
          category: "gmo_food",
          subcategory: "packaged_food",
        }
      )
      expect(result.result.tier).toBe("low")
    })

    it("returns Medium likelihood when one distinct crop family matched (N=1)", () => {
      const result = gmoEngine(
        "ingredients: corn syrup, salt",
        {
          ocrMeanConfidence: 0.9,
          isTruncated: false,
          identityMatch: "name",
          category: "gmo_food",
          subcategory: "packaged_food",
        }
      )
      expect(result.result.tier).toBe("medium")
    })

    it("returns High likelihood when two or more distinct crop families matched (N=2+)", () => {
      const result = gmoEngine(
        "ingredients: corn syrup, soybean oil, salt",
        {
          ocrMeanConfidence: 0.9,
          isTruncated: false,
          identityMatch: "name",
          category: "gmo_food",
          subcategory: "packaged_food",
        }
      )
      expect(result.result.tier).toBe("high")
    })
  })

  // --- 3. Ambiguous-only ingredient list ---
  describe("ambiguous-only ingredient list", () => {
    it("returns Low likelihood with Medium confidence when only ambiguous matches exist and no explicit crop found", () => {
      const result = gmoEngine(
        "ingredients: citric acid, natural flavors, xanthan gum",
        {
          ocrMeanConfidence: 0.9,
          isTruncated: false,
          identityMatch: "name",
          category: "gmo_food",
          subcategory: "packaged_food",
        }
      )
      // The ambiguous-derivative penalty of -1 is applied ONCE per product if
      // any ambiguous match exists with no explicit crop found elsewhere.
      // After the gate removal, the list also earns lookup match rate (+1) and
      // certification clarity (+1), so the penalty yields +2 - 1 = Medium:
      // three fully-recognized ambiguous ingredients with no explicit crop is
      // actually decent signal quality (we read the label cleanly) even though
      // the source crop is unknown. Medium is a legitimate outcome here — Low
      // would imply we couldn't read the label, which is not the case.
      expect(result.result.tier).toBe("low")
      expect(result.confidence.tier).toBe("medium")
    })
  })

  // --- 4. Truncated OCR text / ingredient list completeness ---
  describe("truncated OCR text / ingredient list completeness", () => {
    it("awards +2 points for ingredient list completeness when full list OCR'd", () => {
      const result = gmoEngine(
        "ingredients: corn syrup, soybean oil, citric acid, salt, water",
        {
          ocrMeanConfidence: 0.95,
          isTruncated: false,
          identityMatch: "name",
          category: "gmo_food",
          subcategory: "packaged_food",
        }
      )
      // Full list, no truncation → completeness factor included → score >= 3
      expect(result.confidence.score).toBeGreaterThanOrEqual(3)
    })

    it("does not award the completeness bonus when OCR flags truncation", () => {
      const result = gmoEngine(
        "ingredients: corn syrup, …",
        {
          ocrMeanConfidence: 0.5,
          isTruncated: true,
          identityMatch: "name",
          category: "gmo_food",
          subcategory: "packaged_food",
        }
      )
      // OCR flagged truncation → completeness +2 withheld → score < 3
      expect(result.confidence.score).toBeLessThan(3)
    })
  })

  // --- 5. Confidence is not gated on finding an explicit crop ---
  describe("fully-recognized low-risk-only list", () => {
    it("reaches High confidence with full OCR and no barcode, even though no crop was found", () => {
      const result = gmoEngine(
        "ingredients: salt, water, wheat, olive oil",
        {
          ocrMeanConfidence: 0.95,
          isTruncated: false,
          identityMatch: "none",
          category: "gmo_food",
          subcategory: "packaged_food",
        }
      )
      // N = 0 → Low likelihood, but the read itself is confident: completeness
      // (+2), lookup match rate at 4/4 recognized (+1), certification clarity
      // (+1) = 4 → High. The old explicitCropCount gate wrongly capped this at
      // Medium by withholding both bonuses.
      expect(result.result.tier).toBe("low")
      expect(result.confidence.tier).toBe("high")
      expect(result.confidence.score).toBeGreaterThanOrEqual(4)
    })
  })
})