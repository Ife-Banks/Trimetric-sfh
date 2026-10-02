// End-to-end scan pipeline tests: OCR text in, EngineResult out.
//
// This is the layer where "the scan returns nothing useful" actually lived.
// It was previously only reachable by pointing a phone at a real label, so a
// regression here surfaced as a support complaint rather than a red test.
// Extracting lib/scan/pipeline.ts is what made it assertable.
//
// The OCR strings below are realistic Tesseract output — including the noise it
// actually produces (broken words, stray punctuation, ingredient names merged
// into one comma run).

import { describe, it, expect } from "vitest";

import { runScanPipeline, PipelineError, type OcrOutcome } from "@/lib/scan/pipeline";
import type { IdentificationResult } from "@/lib/identification/productIdentification";
import gmoConfig from "../../../data/gmo_lookup_config_v1.0.json";
import fluorideConfig from "../../../data/fluoride_lookup_config_v1.3.json";
import { gaugeValue } from "@/components/verdict/gaugeValue";

function ocr(text: string, meanConfidence = 0.88): OcrOutcome {
  return { text, meanConfidence, isTruncated: false };
}

const noMatch: IdentificationResult = {
  tier: 0,
  identityMatch: "none",
  note: "no product-name match",
};

describe("scan pipeline — GMO", () => {
  it("produces a verdict from a real front + back label", () => {
    const { engineResult } = runScanPipeline({
      category: "gmo_food",
      frontText: "GOLDEN PENNY\nSemo|ina\nNoodles",
      backText:
        "Ingredients: Soybean oil, wheat flour, salt, citric acid, " +
        "vegetable shortening (may contain soybean), colour (caramel)",
      front: ocr("GOLDEN PENNY Semo|ina Noodles"),
      back: ocr(
        "Ingredients: Soybean oil, wheat flour, salt, citric acid, " +
          "vegetable shortening (may contain soybean), colour (caramel)"
      ),
      identification: noMatch,
      lookupConfig: gmoConfig,
    });

    expect(engineResult.category).toBe("gmo_food");
    expect(engineResult.result.label).toBe("Medium GMO Likelihood");
    expect(engineResult.constraintNotice).toMatch(/cannot confirm GMO content/i);
    expect(engineResult.configVersion).toBe(gmoConfig.version);
    // Guidance must say something about THIS product, not repeat the notice.
    expect(engineResult.guidance).not.toBe(engineResult.constraintNotice);
    expect(engineResult.guidance.toLowerCase()).toContain("soy");
  });

  it("scores a two-crop label as High", () => {
    const back =
      "Ingredients: corn syrup, soybean oil, citric acid, salt, natural flavors";
    const { engineResult } = runScanPipeline({
      category: "gmo_food",
      frontText: "Crunchy Cereal",
      backText: back,
      front: ocr("Crunchy Cereal"),
      back: ocr(back),
      identification: noMatch,
      lookupConfig: gmoConfig,
    });
    expect(engineResult.result.tier).toBe("high");
    // GMO_Build_Guide.md §5: N is DISTINCT families, not ingredient count.
    expect(engineResult.matchedTerms.filter((t) => t.kind === "explicit")).toHaveLength(2);
  });

  it("short-circuits on a certification regardless of the ingredients", () => {
    const { engineResult } = runScanPipeline({
      category: "gmo_food",
      frontText: "Organic Granola USDA Organic",
      backText: "Ingredients: oats, honey, almonds, soybean oil",
      front: ocr("Organic Granola USDA Organic"),
      back: ocr("Ingredients: oats, honey, almonds, soybean oil"),
      identification: noMatch,
      lookupConfig: gmoConfig,
    });
    expect(engineResult.result.tier).toBe("low");
    expect(engineResult.confidence.tier).toBe("high");
    expect(engineResult.matchedTerms.some((t) => t.kind === "certification")).toBe(true);
  });

  it("reports Low for a label with no crop and no ambiguous terms", () => {
    const back = "Ingredients: Rice flour, water, salt.";
    const { engineResult } = runScanPipeline({
      category: "gmo_food",
      frontText: "Rice Crackers",
      backText: back,
      front: ocr("Rice Crackers"),
      back: ocr(back),
      identification: noMatch,
      lookupConfig: gmoConfig,
    });
    expect(engineResult.result.tier).toBe("low");
    // Nothing crop-derived → no honest number for the ring.
    expect(gaugeValue(engineResult)).toBeNull();
  });

  it("uses the INGREDIENTS panel confidence, not the front label's", () => {
    const back = "Ingredients: corn syrup, soybean oil, salt";
    const sharpFront = 0.99;
    const garbledBack = 0.31;
    const { engineContext } = runScanPipeline({
      category: "gmo_food",
      frontText: "Brand Name",
      backText: back,
      front: ocr("Brand Name", sharpFront),
      back: ocr(back, garbledBack),
      identification: noMatch,
      lookupConfig: gmoConfig,
    });
    expect(engineContext.ocrMeanConfidence).toBe(garbledBack);
    // FR-3: below 0.6 the engine must be penalised, which shows up in factors.
    const factors = runScanPipeline({
      category: "gmo_food",
      frontText: "Brand Name",
      backText: back,
      front: ocr("Brand Name", sharpFront),
      back: ocr(back, garbledBack),
      identification: noMatch,
      lookupConfig: gmoConfig,
    }).engineResult.confidence.factors.join(" ");
    expect(factors).toContain("OCR quality");
  });

  it("throws an actionable error instead of a fake verdict when nothing was read", () => {
    // This is the "no results" case: previously the engine ran over "" and
    // returned a confident-looking "Low GMO Likelihood".
    expect(() =>
      runScanPipeline({
        category: "gmo_food",
        frontText: "Something",
        backText: "   \n  ",
        front: ocr("Something"),
        back: ocr("", 0),
        identification: noMatch,
        lookupConfig: gmoConfig,
      })
    ).toThrow(PipelineError);
  });
});

describe("scan pipeline — oral care", () => {
  it("produces a ppm verdict from a toothpaste label", () => {
    const back =
      "Active Ingredients: Sodium Fluoride (0.243% w/w). Inactive: Hydrated Silica, " +
      "Glycerin, Sodium Lauryl Sulfate, Carrageenan.";
    const { engineResult } = runScanPipeline({
      category: "oral_care",
      frontText: "BrightWhite Toothpaste\nFluoride Toothpaste",
      backText: back,
      front: ocr("BrightWhite Toothpaste Fluoride Toothpaste"),
      back: ocr(back),
      identification: noMatch,
      lookupConfig: fluorideConfig,
      detectOralCareSubcategory: () => "toothpaste_gel",
    });

    expect(engineResult.category).toBe("oral_care");
    expect(engineResult.matchedTerms.some((t) => t.kind === "active_compound")).toBe(true);
    // The ring must show the engine's own converted ppm.
    expect(gaugeValue(engineResult)).toEqual({
      number: "1094",
      caption: "ppm fluoride",
    });
  });

  it("routes an oral-care scan to the fluoride engine only", () => {
    // A toothpaste whose ingredient panel mentions soybean must not produce a
    // GMO verdict — the two engines never both run.
    const back = "Ingredients: Aqua, Sodium Fluoride 1450 ppm, Glycerin, Soybean Oil.";
    const { engineResult } = runScanPipeline({
      category: "oral_care",
      frontText: "Mint Toothpaste",
      backText: back,
      front: ocr("Mint Toothpaste"),
      back: ocr(back),
      identification: noMatch,
      lookupConfig: fluorideConfig,
      detectOralCareSubcategory: () => "toothpaste_gel",
    });
    expect(engineResult.category).toBe("oral_care");
    expect(engineResult.result.label).not.toMatch(/GMO/i);
  });

  it("detects a fluoride-free product rather than reporting no data", () => {
    const back = "Ingredients: Aqua, Hydrated Silica, Glycerin. Fluoride free.";
    const { engineResult } = runScanPipeline({
      category: "oral_care",
      frontText: "Natural Toothpaste",
      backText: back,
      front: ocr("Natural Toothpaste"),
      back: ocr(back),
      identification: noMatch,
      lookupConfig: fluorideConfig,
      detectOralCareSubcategory: () => "toothpaste_gel",
    });
    expect(engineResult.result.tier).toBe("none");
    expect(engineResult.result.label).toBe("Fluoride-Free");
  });

  it("keeps 'none' as a distinct tier, not 'low'", () => {
    const back = "Ingredients: Aqua, Hydrated Silica. Fluoride free.";
    const { engineResult } = runScanPipeline({
      category: "oral_care",
      frontText: "Natural Toothpaste",
      backText: back,
      front: ocr("Natural Toothpaste"),
      back: ocr(back),
      identification: noMatch,
      lookupConfig: fluorideConfig,
      detectOralCareSubcategory: () => "toothpaste_gel",
    });
    expect(engineResult.result.tier).toBe("none");
  });

  it("reads a fluoride claim printed only on the FRONT panel", () => {
    // Regression: matching ran against the back panel only, so a toothpaste that
    // states its ppm across the face of the pack returned "No Data" — which
    // reads as a failed scan rather than a product we could not read.
    const back = "Ingredients: Aqua, Hydrated Silica, Glycerin, Sodium Lauryl Sulfate.";
    const { engineResult } = runScanPipeline({
      category: "oral_care",
      frontText: "BrightWhite Anticavity Toothpaste\nFluoride Toothpaste 1450 ppm",
      backText: back,
      front: ocr("BrightWhite Anticavity Toothpaste Fluoride Toothpaste 1450 ppm"),
      back: ocr(back),
      identification: noMatch,
      lookupConfig: fluorideConfig,
      detectOralCareSubcategory: () => "toothpaste_gel",
    });
    expect(engineResult.result.label).not.toBe("No Data");
    expect(engineResult.matchedTerms.some((t) => t.kind === "active_compound")).toBe(true);
  });

  it("reads a 'fluoride free' badge printed only on the FRONT panel", () => {
    const back = "Ingredients: Aqua, Hydrated Silica, Glycerin, Xanthan Gum.";
    const { engineResult } = runScanPipeline({
      category: "oral_care",
      frontText: "Natural Toothpaste — Fluoride Free",
      backText: back,
      front: ocr("Natural Toothpaste — Fluoride Free"),
      back: ocr(back),
      identification: noMatch,
      lookupConfig: fluorideConfig,
      detectOralCareSubcategory: () => "toothpaste_gel",
    });
    expect(engineResult.result.label).toBe("Fluoride-Free");
  });

  it("does NOT read an unrelated preservative ppm as the fluoride level", () => {
    // Guard on the direct-ppm-claim path: it must stay anchored to the word
    // "fluoride" rather than grabbing the first ppm on the panel.
    const back =
      "Ingredients: Aqua, Contains 500 ppm of a preservative, Glycerin, Sodium Fluoride.";
    const { engineResult } = runScanPipeline({
      category: "oral_care",
      frontText: "Mint Mouthwash",
      backText: back,
      front: ocr("Mint Mouthwash"),
      back: ocr(back),
      identification: noMatch,
      lookupConfig: fluorideConfig,
      detectOralCareSubcategory: () => "mouthwash_rinse",
    });
    // Sodium Fluoride named with no adjacent number → config default (1100 ppm),
    // never the preservative's 500.
    const compound = engineResult.matchedTerms.find((t) => t.kind === "active_compound");
    expect(compound?.normalized).toBe("Sodium Fluoride");
    expect(compound?.detail).toBe("default ppm for this compound");
  });

  it("reads a ppm stated without naming the salt", () => {
    // No row in terms_lookup_table matches a bare "fluoride ... 1450 ppm", yet
    // that is how most packs state their concentration on the front.
    const back = "Ingredients: Aqua, Hydrated Silica, Glycerin.";
    const { engineResult } = runScanPipeline({
      category: "oral_care",
      frontText: "Fluoride Toothpaste 1450 ppm",
      backText: back,
      front: ocr("Fluoride Toothpaste 1450 ppm"),
      back: ocr(back),
      identification: noMatch,
      lookupConfig: fluorideConfig,
      detectOralCareSubcategory: () => "toothpaste_gel",
    });
    expect(gaugeValue(engineResult)).toEqual({
      number: "1450",
      caption: "ppm fluoride",
    });
    // A stated figure is a real reading, not a guessed default.
    expect(engineResult.confidence.factors.join(" ")).toContain("WITH an adjacent number");
  });

  it("prefers the back-panel reading when both panels carry a figure", () => {
    // The ingredient panel is authoritative; a marketing number on the front
    // must not override a quantified active-ingredient reading.
    const back = "Active Ingredients: Sodium Fluoride 0.243% w/w. Inactive: Glycerin.";
    const { engineResult } = runScanPipeline({
      category: "oral_care",
      frontText: "Toothpaste for a whiter smile 1100 ppm",
      backText: back,
      front: ocr("Toothpaste for a whiter smile 1100 ppm"),
      back: ocr(back),
      identification: noMatch,
      lookupConfig: fluorideConfig,
      detectOralCareSubcategory: () => "toothpaste_gel",
    });
    expect(gaugeValue(engineResult)).toEqual({
      number: "1094",
      caption: "ppm fluoride",
    });
  });
});

describe("scan pipeline — catalogue match", () => {
  const storedProduct = {
    id: "11111111-1111-4111-8111-111111111111",
    barcode: null,
    name: "Golden Penny Semolina",
    brand: "Golden Penny",
    category: "gmo_food" as const,
    subcategory: "packaged_food",
    ingredients_text: "Soybean oil, wheat flour, salt",
    result_tier: "medium" as const,
    result_label: "Medium GMO Likelihood",
    confidence_tier: "high" as const,
    matched_terms: [{ term: "soybean oil", normalized: "soy", kind: "explicit" as const }],
    guidance_text: "Soybean oil is the primary ingredient.",
    config_version: gmoConfig.version,
    similarity: 0.91,
  };

  it("uses the stored verdict and skips the rules engine on a strong match", () => {
    const identification: IdentificationResult = {
      tier: 2,
      identityMatch: "name",
      product: storedProduct,
      similarity: 0.91,
    };
    const { engineResult, scoredText } = runScanPipeline({
      category: "gmo_food",
      // Deliberately nonsense OCR text: a catalogue hit must not re-score it.
      frontText: "GOLDEN PENNY Semo|ina",
      backText: "Ingredients: corn syrup, soybean oil",
      front: ocr("GOLDEN PENNY Semo|ina"),
      back: ocr("Ingredients: corn syrup, soybean oil"),
      identification,
      lookupConfig: gmoConfig,
    });
    expect(engineResult.result.tier).toBe("medium");
    expect(engineResult.guidance).toBe("Soybean oil is the primary ingredient.");
    expect(scoredText).toBe(storedProduct.ingredients_text);
  });

  it("caps confidence at Medium for a borderline name match", () => {
    const identification: IdentificationResult = {
      tier: 2,
      identityMatch: "name",
      product: { ...storedProduct, confidence_tier: "high" },
      similarity: 0.52,
    };
    const { engineResult } = runScanPipeline({
      category: "gmo_food",
      frontText: "Golden Penny Semo Ina",
      backText: "Ingredients: soybean oil, wheat flour, salt",
      front: ocr("Golden Penny Semo Ina"),
      back: ocr("Ingredients: soybean oil, wheat flour, salt"),
      identification,
      lookupConfig: gmoConfig,
    });
    expect(engineResult.confidence.tier).toBe("medium");
  });

  it("preserves a stored 'none' result tier", () => {
    const identification: IdentificationResult = {
      tier: 2,
      identityMatch: "name",
      product: {
        ...storedProduct,
        category: "oral_care",
        result_tier: "none",
        result_label: "Fluoride-Free",
        ingredients_text: "Aqua, Hydrated Silica. Fluoride free.",
      },
      similarity: 0.95,
    };
    const { engineResult } = runScanPipeline({
      category: "oral_care",
      frontText: "Natural Toothpaste",
      backText: "Ingredients: Aqua, Hydrated Silica.",
      front: ocr("Natural Toothpaste"),
      back: ocr("Ingredients: Aqua, Hydrated Silica."),
      identification,
      lookupConfig: fluorideConfig,
    });
    expect(engineResult.result.tier).toBe("none");
    expect(engineResult.result.label).toBe("Fluoride-Free");
  });
});
