// @vitest-environment jsdom
//
// The mobile-only gate's contract.
//
// The gate is pure CSS: globals.css hides `[data-app-shell]` and shows
// `[data-mobile-gate]` above 1025px, and stands both down for any subtree
// carrying `data-desktop-ok` (the admin console). Nothing in the type system
// connects those three attribute names to the components that emit them, so a
// rename in either place would silently disable the rule — the app would just
// quietly start rendering at laptop width again, which is exactly the bug this
// feature exists to prevent. These tests assert both sides of that contract.
//
// The breakpoint is pinned too. 1025px is not arbitrary: iPads are supported
// devices and the 12.9" Pro is exactly 1024 wide in portrait, while the
// smallest common laptop is 1280. A well-meaning "cleanup" to Tailwind's `lg`
// (1024) or `md` (768) would lock out supported hardware.

import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it, expect, afterEach, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// next/image needs the image optimiser that a bare render does not provide.
vi.mock("next/image", async () => {
  const React = await import("react")
  return {
    default: ({ src, alt, ...rest }: { src: string; alt: string } & Record<string, unknown>) =>
      React.createElement("img", { src, alt, ...rest }),
  }
})

import { MobileOnlyGate } from "@/components/layout/MobileOnlyGate"

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8")

afterEach(cleanup)

describe("MobileOnlyGate", () => {
  it("renders the marker the stylesheet keys on", () => {
    const { container } = render(<MobileOnlyGate />)
    expect(container.querySelector("[data-mobile-gate]")).not.toBeNull()
  })

  it("tells the user what to do", () => {
    render(<MobileOnlyGate />)
    // getByRole throws when the heading is absent, which is the assertion.
    expect(screen.getByRole("heading", { name: "Switch to a mobile device" })).toBeTruthy()
  })
})

describe("the mobile-only rule", () => {
  const css = read("src/app/globals.css")

  it("hides the app shell and shows the gate above 1025px", () => {
    expect(css).toMatch(/min-width:\s*1025px/)
    expect(css).toContain("[data-app-shell]")
    expect(css).toContain("[data-mobile-gate]")
    expect(css).toContain("[data-desktop-ok]")
  })

  it("does not use a Tailwind default that would lock out iPads", () => {
    // 768 (md) excludes nothing we support, but 1024 (lg) is exactly the 12.9"
    // iPad's portrait width — so neither may be the boundary.
    expect(css).not.toMatch(/min-width:\s*1024px/)
    expect(css).not.toMatch(/min-width:\s*768px/)
  })

  it("keeps the admin console exempt", () => {
    expect(read("src/app/admin/layout.tsx")).toContain("data-desktop-ok")
  })
})
