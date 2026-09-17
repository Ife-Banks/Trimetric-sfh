import { describe, expect, it } from "vitest"
import { config } from "../../data/fluoride_lookup_config_v1.3"
import type { Engine, EngineResult, ResultTier } from "./types"
import { fluorideEngine, FLUORIDE_CONSTRAINT_NOTICE } from "./fluorideEngine"
import { readFileSync } from "node:fs"

const ctx = (overrides: Partial<Engine["context"]> = {}) =>
  ({
    ocrMeanConfidence: 0.93,
    isTruncated: false,
    identityMatch: "none",
    category: "oral_care",
    subcategory: "toothpaste_gel",
    ...overrides,
  }) as Engine["context"]

function tierRowFor(subcategory: string, ppm: number) {
  const table = config.category_ppm_tables[subcategory]
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

  it("detects the mouthwash subcategory from label keywords when a mouthwash/rinse term is present", () => {
    const r = fluorideEngine("Mouthwash rinse, Sodium Fluoride 0.02%", ctx())
    expect(r.subcategory).toBe("mouthwash_rinse")
  })

  it("keeps toothpaste_gel when no mouthwash/rinse keyword is present", () => {
    const r = fluorideEngine("Fluoride toothpaste with sodium monofluorophosphate", ctx())
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
  it("short-circuits to tier none / Fluoride-Free when only free-from markers are present", () => {
    const r = fluorideEngine("Hydroxyapatite gel, fluoride-free formula", ctx())
    expect(r.result.tier).toBe("none")
    expect(r.result.label).toBe("Fluoride-Free")
    expect(r.subcategory).toBe("toothpaste_gel")
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
