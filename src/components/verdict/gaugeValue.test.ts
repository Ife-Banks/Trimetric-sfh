import { describe, it, expect } from "vitest"
import { gaugeValue } from "./gaugeValue"
import type { EngineContext, EngineResult } from "@/engines/types"
import { fluorideEngine } from "@/engines/fluorideEngine"
import fluorideConfig from "../../../data/fluoride_lookup_config_v1.3.json"

const CTX: EngineContext = {
  ocrMeanConfidence: 0.95,
  isTruncated: false,
  identityMatch: "none",
  category: "oral_care",
  subcategory: "toothpaste_gel",
}

function score(text: string): EngineResult {
  return fluorideEngine(text, CTX, fluorideConfig)
}

function fluorideResult(overrides: Partial<EngineResult> = {}): EngineResult {
  return {
    category: "oral_care",
    subcategory: "toothpaste_gel",
    result: { tier: "medium", label: "Standard Fluoride" },
    confidence: { tier: "high", score: 5, factors: [] },
    matchedTerms: [],
    guidance: "x",
    constraintNotice: "information only",
    computedAt: new Date().toISOString(),
    configVersion: "1.3",
    ...overrides,
  }
}

describe("gaugeValue — GMO count", () => {
  it("returns the distinct crop-derived ingredient count", () => {
    const r = fluorideResult({ category: "gmo_food" })
    r.matchedTerms = [
      { term: "corn", normalized: "corn", kind: "explicit", detail: "corn" },
      { term: "soy", normalized: "soy", kind: "explicit", detail: "soy" },
    ]
    expect(gaugeValue(r)).toEqual({
      number: "2",
      caption: "crop-derived ingredients",
    })
  })

  it("returns null when nothing crop-derived is matched", () => {
    const r = fluorideResult({ category: "gmo_food" })
    expect(gaugeValue(r)).toBeNull()
  })
})

describe("gaugeValue — fluoride ppm comes from the engine, never re-parsed", () => {
  it("shows a plain ppm figure", () => {
    const r = score("Active ingredients: Sodium Fluoride 1450 ppm")
    expect(gaugeValue(r)).toEqual({
      number: "1450",
      caption: "ppm fluoride",
    })
  })

  it("shows ppm with a trailing F unit marker (1450 ppm F)", () => {
    const r = score("Sodium Monofluorophosphate 1450 ppm F")
    expect(gaugeValue(r)).toEqual({
      number: "1450",
      caption: "ppm fluoride",
    })
  })

  it("converts a % figure using the matched compound multiplier (0.243% sodium fluoride x 4500)", () => {
    const r = score("Active: Sodium Fluoride 0.243% w/w")
    expect(gaugeValue(r)).toEqual({
      number: "1094",
      caption: "ppm fluoride",
    })
  })

  it("prefers the label's explicit ppm over a nearby percentage", () => {
    const r = score("Sodium Fluoride 0.221% w/w (1000 ppm F)")
    expect(gaugeValue(r)).toEqual({
      number: "1000",
      caption: "ppm fluoride",
    })
  })

  it("uses the fluoride-ion percentage conversion and rounds consistently with the engine", () => {
    const r = score("Sodium Fluoride 0.15% w/v fluoride ion")
    expect(gaugeValue(r)).toEqual({
      number: "1500",
      caption: "ppm fluoride",
    })
  })

  it("returns null for a % figure when no compound was matched (no guessing)", () => {
    const r = score("some mystery compound 0.5%")
    expect(gaugeValue(r)).toBeNull()
  })

  it("returns null when the engine fell back to a default ppm rather than reading the label", () => {
    // The engine flags default_ppm explicitly; a guessed default is not real
    // label data, so it must never be presented as a measured value.
    const r = score("Active: Sodium Fluoride")
    const compound = r.matchedTerms.find((t) => t.kind === "active_compound")
    if (compound) expect(compound.detail).toBe("default ppm for this compound")
    expect(gaugeValue(r)).toBeNull()
  })

  it("does NOT headline an unrelated ppm that the engine ignored", () => {
    // Regression: the gauge used to scan the whole label while the engine only
    // reads 60 chars past the matched compound. On this label the engine
    // classifies on the 0.243% -> 1094 ppm conversion; the 500 ppm belongs to a
    // preservative and must never become the product's headline metric.
    const label =
      "Active ingredients: Contains 500 ppm of a preservative. Sodium Fluoride (0.243%)"
    const r = score(label)
    expect(gaugeValue(r)).toEqual({
      number: "1094",
      caption: "ppm fluoride",
    })
    expect(gaugeValue(r)?.number).not.toBe("500")
  })

  it("ignores raw label text entirely — the displayed number is the engine's", () => {
    // Even if the ingredients text handed to the UI contains a different
    // number, the gauge must show what the engine classified on.
    const r = score("Sodium Fluoride 1450 ppm")
    expect(gaugeValue(r)).toEqual({
      number: "1450",
      caption: "ppm fluoride",
    })
  })
})
