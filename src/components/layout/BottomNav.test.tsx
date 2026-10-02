// @vitest-environment jsdom
//
// The tab bar's shape, contents and active state.
//
// Two things this guards, both of which were wrong in the shipped UI:
//   • Visibility — the bar must never disappear mid-flow. It was once hidden for
//     the whole of /scan, so tapping the Scan tab removed the bar that owned it.
//     It now stays up on every in-app screen, camera included.
//   • Active state — the raised "popping out" icon used to be hardcoded onto
//     Scan, so Scan looked selected on every page. It is now the marker of the
//     ACTIVE tab, and the tab set differs between the hub and the flow.

import type { ReactNode } from "react"
import { describe, it, expect, afterEach, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

// Hoisted so the vi.mock factory below can read it — the factory is lifted above
// the imports, and a plain `let` would be in its temporal dead zone.
const state = vi.hoisted(() => ({ path: "/guest-dashboard" }))

vi.mock("next/navigation", () => ({ usePathname: () => state.path }))

// next/link needs an app-router context that a bare render does not provide;
// the test only cares whether the bar is mounted and where its tabs point.
vi.mock("next/link", async () => {
  const React = await import("react")
  return {
    default: ({ children, href, ...rest }: { children?: ReactNode; href: string } & Record<string, unknown>) =>
      React.createElement("a", { href, ...rest }, children),
  }
})

import { BottomNav } from "@/components/layout/BottomNav"

afterEach(() => {
  cleanup()
  state.path = "/guest-dashboard"
})

const NAV = 'nav[aria-label="Primary"]'

function navIsVisible(path: string): boolean {
  state.path = path
  const { container } = render(<BottomNav />)
  return container.querySelector(NAV) !== null
}

/** Tab labels in order. Empty when the bar is not rendered. */
function tabLabels(path: string): string[] {
  state.path = path
  const { container } = render(<BottomNav />)
  return Array.from(container.querySelectorAll(`${NAV} a`)).map(
    (a) => a.textContent?.trim() ?? ""
  )
}

/** Label of the tab marked aria-current="page", or null when none matches. */
function activeLabel(path: string): string | null {
  state.path = path
  const { container } = render(<BottomNav />)
  const el = container.querySelector(`${NAV} a[aria-current="page"]`)
  return el?.textContent?.trim() ?? null
}

/** Does the ACTIVE tab carry the raised circular icon? */
function activeHasRaisedIcon(path: string): boolean {
  state.path = path
  const { container } = render(<BottomNav />)
  const el = container.querySelector(`${NAV} a[aria-current="page"]`)
  return Boolean(el?.querySelector("span.absolute"))
}

/** How many tabs carry the raised circular icon (should be 0 or 1). */
function raisedIconCount(path: string): number {
  state.path = path
  const { container } = render(<BottomNav />)
  return container.querySelectorAll(`${NAV} a span.absolute`).length
}

describe("BottomNav visibility", () => {
  it("shows on every in-app destination, the scan camera included", () => {
    for (const path of ["/guest-dashboard", "/gmo", "/scan", "/history", "/learn", "/settings"]) {
      expect(navIsVisible(path), `${path} should keep the tab bar`).toBe(true)
    }
  })

  it("is hidden on the pre-auth entry screens and on admin", () => {
    for (const path of ["/onboarding", "/register", "/login", "/auth/login", "/admin"]) {
      expect(navIsVisible(path), `${path} should hide the tab bar`).toBe(false)
    }
  })
})

describe("BottomNav tab sets", () => {
  it("gives the hub its own three tabs", () => {
    expect(tabLabels("/guest-dashboard")).toEqual(["Home", "History", "Settings"])
  })

  it("keeps the hub tabs on /settings so the Settings tab does not vanish when tapped", () => {
    expect(tabLabels("/settings")).toEqual(["Home", "History", "Settings"])
  })

  it("gives the GMO flow four tabs", () => {
    expect(tabLabels("/gmo")).toEqual(["Home", "Scan", "History", "Learn"])
    expect(tabLabels("/scan")).toEqual(["Home", "Scan", "History", "Learn"])
    expect(tabLabels("/learn")).toEqual(["Home", "Scan", "History", "Learn"])
    expect(tabLabels("/history")).toEqual(["Home", "Scan", "History", "Learn"])
  })
})

describe("BottomNav active tab", () => {
  it("marks the tab that matches the current route, and only that one", () => {
    expect(activeLabel("/guest-dashboard")).toBe("Home")
    expect(activeLabel("/history")).toBe("History")
    expect(activeLabel("/learn")).toBe("Learn")
    expect(activeLabel("/scan")).toBe("Scan")
    expect(activeLabel("/settings")).toBe("Settings")
  })

  it("marks nothing active on a route that is not a tab", () => {
    // /gmo is the GMO flow's home, reached from the hub. Nothing here should read
    // as selected — this is the case that used to show a permanently-active Scan.
    expect(activeLabel("/gmo")).toBeNull()
    expect(raisedIconCount("/gmo")).toBe(0)
  })

  it("puts the raised icon on the active tab only", () => {
    expect(activeHasRaisedIcon("/scan")).toBe(true)
    expect(activeHasRaisedIcon("/guest-dashboard")).toBe(true)
    expect(activeHasRaisedIcon("/settings")).toBe(true)
    expect(raisedIconCount("/scan")).toBe(1)
    expect(raisedIconCount("/history")).toBe(1)
  })
})
