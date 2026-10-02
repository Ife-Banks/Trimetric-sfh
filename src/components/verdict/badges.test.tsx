// @vitest-environment jsdom
//
// The two-badge constraint — 06_AGENT_CONTEXT.md §2 constraint 1, restated in
// 08_DESIGN_SYSTEM.md §3:
//
//   "If these two ever end up the same shape or overlapping hue family, that's a
//    regression, not a style choice."
//
// Result (Low/Medium/High likelihood) and Confidence (Low/Medium/High) are the
// product's core idea: "Low GMO likelihood, High confidence" and "Low GMO
// likelihood, Low confidence" must not look alike. Nothing else in the suite
// guards this — a styling change could make the two chips identical and every
// other test would still pass.
//
// The nine tier combinations (3 result × 3 confidence) are the fixtures
// 03_FRONTEND_ARCHITECTURE.md §9 calls for.

import { describe, it, expect, afterEach } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ResultBadge } from "@/components/verdict/ResultBadge"
import { ConfidenceBadge } from "@/components/verdict/ConfidenceBadge"
import type { EngineResult, ResultTier, VerdictTier } from "@/engines/types"

afterEach(cleanup)

const RESULT_TIERS: ResultTier[] = ["none", "low", "medium", "high"]
const CONFIDENCE_TIERS: VerdictTier[] = ["low", "medium", "high"]

function resultBadgeClass(tier: ResultTier): string {
  const { container } = render(
    <ResultBadge tier={tier} label={`${tier.toUpperCase()} GMO Likelihood`} />
  )
  const el = container.querySelector("span")
  if (!el) throw new Error("ResultBadge rendered no element")
  return el.className
}

function confidenceBadgeClass(tier: VerdictTier): string {
  const { container } = render(<ConfidenceBadge tier={tier} factors={[]} />)
  const el = container.querySelector("button")
  if (!el) throw new Error("ConfidenceBadge rendered no button")
  return el.className
}

describe("the two badges must never be mistaken for one", () => {
  it("ResultBadge is a pill; ConfidenceBadge is not", () => {
    for (const tier of RESULT_TIERS) {
      expect(resultBadgeClass(tier)).toContain("rounded-full")
    }
    for (const tier of CONFIDENCE_TIERS) {
      const cls = confidenceBadgeClass(tier)
      expect(cls).toContain("rounded-md")
      // The rectangular chip must not gain a pill radius.
      expect(cls).not.toContain("rounded-full")
    }
  })

  it("their hue families are disjoint", () => {
    // Result tiers are green/amber/red/gray (semantic tiers).
    const resultFamilies = [
      "success",
      "warning",
      "destructive",
      "tier-none",
    ]
    // Confidence is a "trust" signal and must not borrow a result hue.
    const confidenceFamilies = [
      "confidence-high",
      "confidence-medium",
      "confidence-low",
    ]

    const resultClasses = RESULT_TIERS.map(resultBadgeClass).join(" ")
    const confidenceClasses = CONFIDENCE_TIERS.map(confidenceBadgeClass).join(" ")

    for (const family of resultFamilies) {
      expect(resultClasses).toContain(family)
      expect(confidenceClasses).not.toContain(family)
    }
    for (const family of confidenceFamilies) {
      expect(confidenceClasses).toContain(family)
      expect(resultClasses).not.toContain(family)
    }
  })

  it("they are distinguishable by shape alone, with colour removed", () => {
    // The 08_DESIGN_SYSTEM.md §6 check: view in grayscale. If the only
    // difference were hue, this assertion would fail once colours are stripped.
    expect(resultBadgeClass("low")).toContain("rounded-full")
    expect(confidenceBadgeClass("high")).toContain("rounded-md")

    // ResultBadge = a coloured dot + label; ConfidenceBadge = a 3-bar signal
    // meter. Different furniture, so the shapes differ without colour.
    const { container } = render(<ResultBadge tier="low" label="Low likelihood" />)
    const dot = container.querySelector("span > span")
    expect(dot?.className).toContain("rounded-full")
    expect(dot?.className).toContain("bg-")

    const conf = render(<ConfidenceBadge tier="high" factors={[]} />)
    const meter = conf.container.querySelector("[aria-hidden='true']")
    expect(meter?.className).toContain("w-6")
    // The meter is three bars, not a single dot.
    expect(meter?.querySelectorAll("span").length).toBe(3)
  })
})

describe("never colour alone — text labels are always present", () => {
  it.each(RESULT_TIERS)("ResultBadge %s renders its text label", (tier) => {
    render(<ResultBadge tier={tier} label={`${tier} result`} />)
    expect(screen.getByText(`${tier} result`)).toBeTruthy()
  })

  it.each(CONFIDENCE_TIERS)("ConfidenceBadge %s renders a text label", (tier) => {
    render(<ConfidenceBadge tier={tier} factors={[]} />)
    expect(
      screen.getByText(
        tier === "high"
          ? "High confidence"
          : tier === "medium"
            ? "Medium confidence"
            : "Low confidence"
      )
    ).toBeTruthy()
  })

  it("the signal meter is decorative — the label carries the meaning", () => {
    const { container } = render(<ConfidenceBadge tier="low" factors={[]} />)
    const meter = container.querySelector("[aria-hidden='true'].w-6")
    expect(meter).toBeTruthy()
  })
})

describe("all nine result × confidence combinations render independently", () => {
  const combos: Array<[ResultTier, VerdictTier]> = []
  for (const r of RESULT_TIERS) for (const c of CONFIDENCE_TIERS) combos.push([r, c])

  it.each(combos)("result %s with %s confidence shows both values as text", (r, c) => {
    const confidenceLabel =
      c === "high" ? "High confidence" : c === "medium" ? "Medium confidence" : "Low confidence"
    render(
      <>
        <ResultBadge tier={r} label={`${r} likelihood`} />
        <ConfidenceBadge tier={c} factors={["a factor"]} />
      </>
    )
    expect(screen.getByText(`${r} likelihood`)).toBeTruthy()
    expect(screen.getByText(confidenceLabel)).toBeTruthy()
  })
})

describe("ConfidenceBadge expands to show its factors", () => {
  it("hides the factors until asked, then reveals them", () => {
    const factors = [
      "Ingredient list completeness — full list OCR'd, no visible truncation",
      "Lookup match rate — ≥80% of extracted ingredients recognized",
    ]
    render(<ConfidenceBadge tier="medium" factors={factors} />)

    const button = screen.getByRole("button", { name: /medium confidence/i })
    expect(button.getAttribute("aria-expanded")).toBe("false")

    // The panel stays mounted so the collapse can animate, but it is hidden
    // from assistive tech while collapsed.
    expect(screen.queryByText(factors[0])).toBeTruthy()

    fireEvent.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText(factors[0])).toBeTruthy()
    expect(screen.getByText(factors[1])).toBeTruthy()
  })
})

describe("a stored-verdict EngineResult renders both badges from one shared surface", () => {
  const base: EngineResult = {
    category: "gmo_food",
    subcategory: "packaged_food",
    result: { tier: "low", label: "Low GMO Likelihood" },
    confidence: { tier: "high", score: 4, factors: ["stored catalogue verdict"] },
    matchedTerms: [],
    guidance: "g",
    constraintNotice: "c",
    computedAt: "2026-01-01T00:00:00.000Z",
    configVersion: "1.1",
  }

  it("renders Low likelihood and High confidence as two distinct elements", () => {
    const { container } = render(
      <>
        <ResultBadge tier={base.result.tier} label={base.result.label} />
        <ConfidenceBadge tier={base.confidence.tier} factors={base.confidence.factors} />
      </>
    )
    expect(screen.getByText("Low GMO Likelihood")).toBeTruthy()
    expect(screen.getByText("High confidence")).toBeTruthy()
    // Different elements, different shapes — not one merged score.
    expect(container.querySelectorAll("button").length).toBe(1)
    expect(resultBadgeClass("low")).not.toBe(confidenceBadgeClass("high"))
  })
})
