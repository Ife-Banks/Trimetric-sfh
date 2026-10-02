import { describe, it, expect, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// TEST SUITE — gmoEngine likelihood + confidence scoring (real engine)
// Tests import the real function; gmoEngine.ts has not been written yet,
// so compilation will fail until it is implemented. This is intentional.
// ---------------------------------------------------------------------------

// The real engine signature: (ingredientsText: string, ctx: EngineContext) => EngineResult
import { gmoEngine } from "./gmoEngine"
import config from "../../data/gmo_lookup_config_v1.0.json"
import type { EngineContext } from "./types"

const scoreGmo = (text: string, context: EngineContext) => gmoEngine(text, context, config)

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
      const result = scoreGmo(
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

    it("caps the short-circuit at Medium when the certification was read at low OCR confidence (FR-3)", () => {
      // The result still short-circuits (the claim is present), but a 0.3 read
      // may be a misread, so the confidence can no longer be High.
      const result = scoreGmo("Non-GMO Project Verified corn syrup, salt", {
        ocrMeanConfidence: 0.3,
        isTruncated: false,
        identityMatch: "none",
        category: "gmo_food",
        subcategory: "packaged_food",
      })
      expect(result.result.tier).toBe("low")
      expect(result.confidence.tier).toBe("medium")
      expect(result.confidence.factors.some((f) => f.includes("OCR quality"))).toBe(true)
    })
  })

  // --- 2. N=0, N=1, N=2+ likelihood tiers ---
  describe("likelihood tiers from distinct crop families", () => {
    it("returns Low likelihood when no explicit crop families matched (N=0)", () => {
      const result = scoreGmo(
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
      const result = scoreGmo(
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
      const result = scoreGmo(
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
    it("returns Low likelihood, and does not let ambiguity alone drag confidence down", () => {
      const result = scoreGmo(
        "ingredients: citric acid, natural flavors, xanthan gum",
        {
          ocrMeanConfidence: 0.9,
          isTruncated: false,
          identityMatch: "name",
          category: "gmo_food",
          subcategory: "packaged_food",
        }
      )
      // N = 0 → Low likelihood. Ambiguous derivatives must NEVER raise the
      // likelihood score (GMO_Build_Guide.md §3.3) — they only cost confidence.
      expect(result.result.tier).toBe("low")

      // Confidence arithmetic per GMO_Build_Guide.md §6:
      //   completeness      +2  (not truncated)
      //   identification    +1  (name match, no similarity → tentative)
      //   lookup match rate +1  (3/3 tokens recognized)
      //   cert clarity      +1  (full readable list)
      //   ambiguous penalty −1  (applied ONCE, not per match)
      //                       = 4 → High
      // High confidence here is correct and is the point of the two independent
      // axes: we read this label cleanly, we are simply confident that NO GMO
      // crop is declared. It is not a claim that the product is GMO-free.
      expect(result.confidence.score).toBe(4)
      expect(result.confidence.tier).toBe("high")
      expect(result.confidence.factors.join(" ")).toContain("Ambiguous-derivative penalty")
    })

    it("applies the ambiguous penalty ONCE regardless of how many ambiguous terms match", () => {
      // 07_GMO_DATASET_QA_REVIEW.md §4: the penalty describes one fact about
      // the product ("this label contains untraceable ingredients"), not N.
      const one = scoreGmo("citric acid", {
        ocrMeanConfidence: 0.9,
        isTruncated: false,
        identityMatch: "name",
        category: "gmo_food",
        subcategory: "packaged_food",
      })
      const many = scoreGmo("citric acid, natural flavors, xanthan gum, molasses, lecithin", {
        ocrMeanConfidence: 0.9,
        isTruncated: false,
        identityMatch: "name",
        category: "gmo_food",
        subcategory: "packaged_food",
      })
      expect(one.confidence.score).toBe(many.confidence.score)
    })
  })

  // --- 3b. OCR-quality penalty (FR-3) ---
  describe("OCR-quality penalty (FR-3: mean confidence < 0.6 costs confidence)", () => {
    const baseCtx = {
      isTruncated: false,
      identityMatch: "name" as const,
      category: "gmo_food" as const,
      subcategory: "packaged_food",
    }
    const ingredients = "ingredients: corn syrup, soybean oil, citric acid, salt, water"

    it("does not penalise a confidently-read label", () => {
      const good = scoreGmo(ingredients, { ...baseCtx, ocrMeanConfidence: 0.9 })
      expect(good.confidence.factors.join(" ")).not.toContain("OCR quality")
    })

    it("penalises a poorly-read label exactly once", () => {
      const poor = scoreGmo(ingredients, { ...baseCtx, ocrMeanConfidence: 0.4 })
      expect(poor.confidence.factors.join(" ")).toContain("OCR quality")
      const qualityFactors = poor.confidence.factors.filter((f) => f.startsWith("OCR quality"))
      expect(qualityFactors).toHaveLength(1)
      // One point lower than the same read at high confidence.
      expect(poor.confidence.score).toBe(scoreGmo(ingredients, { ...baseCtx, ocrMeanConfidence: 0.9 }).confidence.score - 1)
    })

    it("treats the threshold as inclusive-below: exactly 0.6 is not penalised", () => {
      const at = scoreGmo(ingredients, { ...baseCtx, ocrMeanConfidence: 0.6 })
      expect(at.confidence.factors.join(" ")).not.toContain("OCR quality")
    })
  })

  // --- 3c. Certification short-circuit reads the FRONT panel ---
  describe("certification short-circuit searches the front label too", () => {
    // Regression: the short-circuit only scanned the ingredients text, but FR-1
    // assigns certification marks to the front panel. A USDA Organic granola
    // whose seal sits next to the brand name was scored on its soybean oil and
    // returned "Medium GMO Likelihood" instead of Low.
    const ctx = {
      ocrMeanConfidence: 0.9,
      isTruncated: false,
      identityMatch: "none" as const,
      category: "gmo_food" as const,
      subcategory: "packaged_food",
    }
    const ingredients = "Ingredients: oats, honey, almonds, soybean oil"

    it("short-circuits on a certification printed on the front label", () => {
      const r = gmoEngine(ingredients, {
        ...ctx,
        packageFrontText: "Organic Granola USDA ORGANIC",
      }, config)
      expect(r.result.tier).toBe("low")
      expect(r.confidence.tier).toBe("high")
      expect(r.matchedTerms.some((t) => t.kind === "certification")).toBe(true)
      // The offending ingredient is still present but must not be scored.
      expect(r.matchedTerms.some((t) => t.kind === "explicit")).toBe(false)
      expect(r.guidance).toContain("front label")
    })

    it("still short-circuits when the certification is in the ingredient list", () => {
      const r = gmoEngine(
        "Ingredients: oats, honey, Certified Organic, soybean oil",
        ctx,
        config
      )
      expect(r.result.tier).toBe("low")
      expect(r.guidance).toContain("ingredient list")
    })

    it("does NOT short-circuit on a non-GMO mark", () => {
      // Halal / Kosher / Vegan are not GMO certifications
      // (07_GMO_DATASET_QA_REVIEW.md, and the validation suite asserts this).
      const r = gmoEngine(ingredients, {
        ...ctx,
        packageFrontText: "KOSHER CERTIFIED Halal Vegan",
      }, config)
      expect(r.matchedTerms.some((t) => t.kind === "certification")).toBe(false)
      expect(r.result.tier).toBe("medium") // soybean oil → N=1
    })

    it("is unchanged when no front text is supplied (admin recompute path)", () => {
      const r = gmoEngine(ingredients, ctx, config)
      expect(r.result.tier).toBe("medium")
      expect(r.matchedTerms.some((t) => t.kind === "certification")).toBe(false)
    })
  })

  // --- 4. Truncated OCR text / ingredient list completeness ---
  describe("truncated OCR text / ingredient list completeness", () => {
    it("awards +2 points for ingredient list completeness when full list OCR'd", () => {
      const result = scoreGmo(
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
      const result = scoreGmo(
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
      const result = scoreGmo(
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
