// @vitest-environment jsdom
//
// The tab bar's visibility rule.
//
// This exists because the rule was wrong in a way no other test could see: the
// bar was hidden for the WHOLE of /scan, so tapping the Scan tab removed the
// tab bar that owned it. Nothing in the suite covered navigation chrome, so the
// regression was invisible until someone used the app.
//
// The rule is two questions and these cases keep them apart:
//   • route  — the pre-auth entry screens and admin never show the bar
//   • page   — a full-bleed page (the scan viewfinder) may hide it, temporarily

import type { ReactNode } from "react"
import { describe, it, expect, afterEach, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

// Hoisted so the vi.mock factory below can read it — the factory is lifted above
// the imports, and a plain `let` would be in its temporal dead zone.
const state = vi.hoisted(() => ({ path: "/guest-dashboard" }))

vi.mock("next/navigation", () => ({ usePathname: () => state.path }))

// next/link needs an app-router context that a bare render does not provide;
// the test only cares whether the bar is mounted, not where it points.
vi.mock("next/link", async () => {
  const React = await import("react")
  return {
    default: ({ children, href, ...rest }: { children?: ReactNode; href: string } & Record<string, unknown>) =>
      React.createElement("a", { href, ...rest }, children),
  }
})

import { BottomNav } from "@/components/layout/BottomNav"
import { scanStepHidesTabBar, setNavHidden } from "@/lib/navVisibility"

afterEach(() => {
  cleanup()
  setNavHidden(false)
  state.path = "/guest-dashboard"
})

function navIsVisible(path: string): boolean {
  state.path = path
  const { container } = render(<BottomNav />)
  return container.querySelector('nav[aria-label="Primary"]') !== null
}

describe("BottomNav visibility", () => {
  it("shows on every in-app destination", () => {
    for (const path of ["/guest-dashboard", "/history", "/settings", "/learn"]) {
      expect(navIsVisible(path), `${path} should keep the tab bar`).toBe(true)
    }
  })

  it("stays on /scan, because the Scan tab must not remove the bar it lives in", () => {
    expect(navIsVisible("/scan")).toBe(true)
    expect(navIsVisible("/scan?category=fluoride")).toBe(true)
  })

  it("is hidden on the pre-auth entry screens and on admin", () => {
    for (const path of ["/onboarding", "/register", "/login", "/auth/login", "/admin"]) {
      expect(navIsVisible(path), `${path} should hide the tab bar`).toBe(false)
    }
  })

  it("hides only while a page explicitly asks it to, and comes straight back", () => {
    setNavHidden(true)
    expect(navIsVisible("/scan")).toBe(false)

    setNavHidden(false)
    expect(navIsVisible("/scan")).toBe(true)
  })
})

describe("scan steps that hide the tab bar", () => {
  it("hides it only behind the viewfinder and the analyzing screen", () => {
    for (const step of ["front", "back", "analyzing"]) {
      expect(scanStepHidesTabBar(step), step).toBe(true)
    }
  })

  it("keeps it on every step that shows the user something", () => {
    for (const step of ["review", "done", "provisional", "add", "thanks"]) {
      expect(scanStepHidesTabBar(step), step).toBe(false)
    }
  })
})
