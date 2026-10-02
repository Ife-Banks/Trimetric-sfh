import { describe, expect, it } from "vitest"
import config from "../../data/fluoride_lookup_config_v1.3.json"
import type { EngineContext } from "./types"
import { fluorideEngine as runFluorideEngine, FLUORIDE_CONSTRAINT_NOTICE } from "./fluorideEngine"

const fluorideEngine = (text: string, context: EngineContext) => runFluorideEngine(text, context, config)
import { readFileSync } from "node:fs"

type PpmTableRow = { tier: string; ppm_range: number[]; verdict: string; guidance?: string }
type SubcategoryTables = Record<string, PpmTableRow[]>

const ctx = (overrides: Partial<EngineContext> = {}) =>
  ({
    ocrMeanConfidence: 0.93,
    isTruncated: false,
    identityMatch: "none",
    category: "oral_care",
    subcategory: "toothpaste_gel",
    ...overrides,
  }) as EngineContext

function tierRowFor(subcategory: string, ppm: number) {
  const table = (config.category_ppm_tables as SubcategoryTables)[subcategory]
  const row = table.find((r) => ppm >= r.ppm_range[0] && ppm <= r.ppm_range[1])
  if (!row) throw new Error(`no row for ppm ${ppm} in ${subcategory}`)
  return row
}

describe("fluorideEngine — shared surface contract", () => {
  it("returns an EngineResult with the shared shape the VerdictScreen renders", () => {
    const r = fluorideEngine("Fluoride toothpaste", ctx())
    expect(r.category).toBe("oral_care")
    expect(r.subcategory).toBe("toothpaste_gel")
    expect(r.result).toMatchObject({ tier: expect.any(String), label: expect.any(String) })
    expect(r.confidence.tier).toMatch(/low|medium|high/)
    expect(typeof r.confidence.score).toBe("number")
    expect(Array.isArray(r.confidence.factors)).toBe(true)
  })

  it("carries the honesty constraint notice on every verdict — not dismissible", () => {
    const r = fluorideEngine("Fluoride toothpaste", ctx())
    expect(r.constraintNotice).toBe(FLUORIDE_CONSTRAINT_NOTICE)
    expect(FLUORIDE_CONSTRAINT_NOTICE.length).toBeGreaterThan(0)
  })

  it("records configVersion and computedAt", () => {
    const r = fluorideEngine("Fluoride toothpaste", ctx())
    expect(r.configVersion).toBe(config.version)
    expect(r.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe("fluorideEngine — subcategory routing (FR-4)", () => {
  it("honors a valid ctx subcategory without keyword detection", () => {
    const r = fluorideEngine(
      "Active: Sodium Fluoride 0.05%. Anticavity mouthwash rinse.",
      ctx({ subcategory: "mouthwash_rinse" })
    )
    expect(r.subcategory).toBe("mouthwash_rinse")
  })

  it("honors a validated ctx subcategory even when the text has NO label keywords", () => {
    const r = fluorideEngine("Sodium Fluoride 1100 ppm", ctx({ subcategory: "mouthwash_rinse" }))
    expect(r.subcategory).toBe("mouthwash_rinse")
    // A validated subcategory is NOT a fallback guess — confidence is not
    // capped for the routing itself.
    expect(r.confidence.factors.some((f) => f.includes("Subcategory guessed"))).toBe(false)
  })

  it("detects the mouthwash subcategory from label keywords when a mouthwash/rinse term is present", () => {
    const r = fluorideEngine("Mouthwash rinse, Sodium Fluoride 0.02%", ctx({ subcategory: "" }))
    expect(r.subcategory).toBe("mouthwash_rinse")
  })

  it("keeps toothpaste_gel when no mouthwash/rinse keyword is present", () => {
    const r = fluorideEngine("Fluoride toothpaste with sodium monofluorophosphate", ctx({ subcategory: "" }))
    expect(r.subcategory).toBe("toothpaste_gel")
  })
})

describe("fluorideEngine — toothpaste/gel tiering", () => {
  it.each([275, 1350, 9000] as const)(
    "classifies %d ppm sodium-fluoride toothpaste into the config tier for that ppm",
    (ppm) => {
      const r = fluorideEngine(`Sodium Fluoride ${ppm} ppm toothpaste`, ctx())
      const expected = tierRowFor("toothpaste_gel", ppm)
      expect(r.result.label).toBe(expected.verdict)
      expect(r.result.tier).not.toBe("none")
    }
  )

  it("uses the printed ppm when both percent and ppm are present", () => {
    const result = fluorideEngine("Sodium Fluoride 0.221% w/w (1000 ppm F)", ctx())
    expect(result.result.label).toBe("Standard Fluoride Content")
    expect(result.result.tier).toBe("medium")
  })

  it("converts an explicitly stated fluoride-ion percentage as ppm fluoride ion", () => {
    const result = fluorideEngine("Sodium Fluoride 0.15% w/v fluoride ion", ctx())
    expect(result.result.label).toBe("Standard Fluoride Content")
    expect(result.result.tier).toBe("medium")
  })

  it("rounds fractional ppm upward at the standard-tier boundary", () => {
    const result = fluorideEngine("Sodium Monofluorophosphate 0.76%", ctx())
    expect(result.result.label).toBe("Standard Fluoride Content")
    expect(result.result.tier).toBe("medium")
  })
})

describe("fluorideEngine — mouthwash/rinse tiering", () => {
  it.each([45, 175, 640] as const)(
    "classifies %d ppm sodium-fluoride rinse into the config tier for that ppm",
    (ppm) => {
      const r = fluorideEngine(`Sodium Fluoride ${ppm} ppm mouthwash rinse`, ctx({ subcategory: "mouthwash_rinse" }))
      const expected = tierRowFor("mouthwash_rinse", ppm)
      expect(r.result.label).toBe(expected.verdict)
      expect(r.result.tier).not.toBe("none")
    }
  )
})

describe("fluorideEngine — fluoride-free honesty", () => {
  it("returns No Data instead of Fluoride-Free when no fluoride marker was recognized", () => {
    const result = fluorideEngine(
      "i i i i I i Iy 4 | p . f i 4 f I i i! ih",
      ctx({ ocrMeanConfidence: 0.36 })
    )

    expect(result.result).toEqual({ tier: "none", label: "No Data" })
    expect(result.confidence.tier).toBe("low")
    expect(result.guidance).toContain("Insufficient label text")
  })

  it("short-circuits to tier none / Fluoride-Free when only free-from markers are present", () => {
    const r = fluorideEngine("Hydroxyapatite gel, fluoride-free formula", ctx())
    expect(r.result.tier).toBe("none")
    expect(r.result.label).toBe("Fluoride-Free")
    expect(r.subcategory).toBe("toothpaste_gel")
  })

  it("caps a fluoride-free short-circuit at Medium when the subcategory is a fallback guess", () => {
    const r = fluorideEngine("fluoride-free formula", ctx({ subcategory: "" }))
    expect(r.result.tier).toBe("none")
    expect(r.confidence.tier).toBe("medium")
    expect(r.confidence.factors.some((f) => f.includes("Subcategory guessed"))).toBe(true)
  })

  it("still emits the constraint notice on a fluoride-free verdict", () => {
    const r = fluorideEngine("fluoride free toothpaste", ctx())
    expect(r.constraintNotice).toBe(FLUORIDE_CONSTRAINT_NOTICE)
  })
})

describe("fluorideEngine — confidence honesty", () => {
  it("caps confidence at Medium when the default ppm fallback is used (no adjacent number)", () => {
    const r = fluorideEngine("Sodium Fluoride toothpaste", ctx())
    expect(["low", "medium"]).toContain(r.confidence.tier)
  })

  it("cannot reach High via a default-ppm fallback even with a barcode match (cap is 3, not 4)", () => {
    const r = fluorideEngine(
      "Sodium Monofluorophosphate dentifrice",
      ctx({ identityMatch: "barcode" })
    )
    // +2 completeness, +2 barcode, +1 lookup, +0 concentration = 5, but a
    // default-ppm fallback is capped at 3 → Medium. With the old Math.min(4)
    // this reached exactly 4 → High, which overstates a guess.
    expect(r.confidence.tier).toBe("medium")
    expect(r.confidence.score).toBe(3)
  })

  it("cannot reach High when the subcategory is a fallback guess, even with a barcode AND an explicit ppm", () => {
    // "Sodium Monofluorophosphate sodium fluoride 1450 ppm" has NO label
    // keyword (no toothpaste/mouthwash) and no validated ctx subcategory → the
    // subcategory is defaulted to tooth/gel. Build guide §5: that guess caps
    // confidence at Medium. Old code returned High here (2+2+1+1 = 6 → High).
    const r = fluorideEngine(
      "Sodium Monofluorophosphate sodium fluoride 1450 ppm",
      ctx({ identityMatch: "barcode", subcategory: "" })
    )
    expect(r.subcategory).toBe("toothpaste_gel")
    expect(r.confidence.tier).toBe("medium")
    expect(r.confidence.score).toBe(3)
    expect(r.confidence.factors.some((f) => f.includes("Subcategory guessed"))).toBe(true)
  })

  it("does not claim High confidence without an explicit ppm value", () => {
    const r = fluorideEngine("Sodium Monofluorophosphate dentifrice", ctx())
    expect(r.confidence.tier).not.toBe("high")
  })

  it("reports low-medium confidence honestly when text is truncated", () => {
    const r = fluorideEngine("Sodium Fluoride 1", ctx({ isTruncated: true }))
    expect(["low", "medium"]).toContain(r.confidence.tier)
  })

  it("never claims proof — every verdict carries the information-only notice", () => {
    const r = fluorideEngine("Sodium Fluoride 1350 ppm toothpaste", ctx())
    expect(r.constraintNotice).toContain("information")
    expect(r.constraintNotice).not.toContain("proven")
  })
})

describe("fluorideEngine — engine purity", () => {
  it("returns matchedTerms from the lookup config table", () => {
    const r = fluorideEngine("Sodium Fluoride 1350 ppm toothpaste", ctx())
    expect(Array.isArray(r.matchedTerms)).toBe(true)
  })

  it("produces deterministic output for the same input", () => {
    const a = fluorideEngine("Sodium Fluoride 1350 ppm toothpaste gel", ctx())
    const b = fluorideEngine("Sodium Fluoride 1350 ppm toothpaste gel", ctx())
    expect(a.result).toEqual(b.result)
    expect(a.confidence).toEqual(b.confidence)
  })

  it("read the config from disk without erroring on its doc-only keys", () => {
    const cfg = JSON.parse(readFileSync("data/fluoride_lookup_config_v1.3.json", "utf8"))
    expect(cfg.category_ppm_tables.toothpaste_gel.length).toBeGreaterThan(0)
    expect(cfg.category_ppm_tables.mouthwash_rinse.length).toBeGreaterThan(0)
    expect(Object.keys(cfg.subcategory_detection)).toContain("note")
  })
})

describe("fluorideEngine — OCR-quality penalty (FR-3)", () => {
  // A quantified, non-fallback reading so the main verdict path is exercised:
  // completeness (+2) + lookup (+1) + concentration (+1) = 4 → High.
  const text = "Sodium Fluoride 1450 ppm toothpaste gel"

  it("scores a clean read as High, and the same label one point lower when OCR is poor", () => {
    const clean = fluorideEngine(text, ctx())
    expect(clean.confidence.tier).toBe("high")
    expect(clean.confidence.score).toBe(4)

    // Previously the penalty existed ONLY in the "No Data" branch, so this
    // verdict stayed High no matter how badly the label was read.
    const poor = fluorideEngine(text, ctx({ ocrMeanConfidence: 0.36 }))
    expect(poor.confidence.score).toBe(3)
    expect(poor.confidence.tier).toBe("medium")
    expect(poor.confidence.factors.some((f) => f.includes("OCR quality"))).toBe(true)
  })

  it("does not penalise a read at or above the 0.6 threshold", () => {
    const r = fluorideEngine(text, ctx({ ocrMeanConfidence: 0.6 }))
    expect(r.confidence.factors.some((f) => f.includes("OCR quality"))).toBe(false)
    expect(r.confidence.tier).toBe("high")
  })

  it("caps a fluoride-free short-circuit at Medium on a low-confidence read", () => {
    const clean = fluorideEngine("Fluoride-free formula", ctx())
    expect(clean.result.label).toBe("Fluoride-Free")
    expect(clean.confidence.tier).toBe("high")

    const poor = fluorideEngine("Fluoride-free formula", ctx({ ocrMeanConfidence: 0.3 }))
    expect(poor.result.label).toBe("Fluoride-Free")
    expect(poor.confidence.tier).toBe("medium")
    expect(poor.confidence.factors.some((f) => f.includes("OCR quality"))).toBe(true)
  })
})
