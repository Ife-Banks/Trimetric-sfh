"use client"

// GMO Check tab bar (Figma `bobby`, node 948:3154) — Home / Scan / History /
// Learn, with Scan raised into a mint-green circle that breaks the bar's top
// edge. One set of tabs for everyone: the design has no guest/member split,
// and "History" replaced the old "Submissions"/"Setting" naming.
//
// Visibility is two questions, deliberately kept apart:
//   • which ROUTES never want the bar at all — the pre-auth entry screens and
//     admin, which has its own navigation;
//   • whether the CURRENT PAGE wants it out of the way for a moment, which only
//     the full-bleed scan viewfinder does (lib/navVisibility).
// /scan is NOT in the route list any more: hiding the bar for the whole scan
// flow meant tapping the Scan tab removed the tab bar that owned it.
//
// A spacer of the same height is rendered after the bar so fixed positioning
// never covers the last row of content.

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSyncExternalStore } from "react"
import { BookOpen, History, House, ScanLine } from "lucide-react"
import {
  getNavHiddenServerSnapshot,
  getNavHiddenSnapshot,
  subscribeToNav,
} from "@/lib/navVisibility"
import { cn } from "cn"

// Home points at /guest-dashboard, NOT "/". The root path unconditionally
// redirects to /onboarding, and /onboarding hides this nav — so a "Home" tab
// linking to "/" dumped people into the 3-slide carousel with no way out.
// /guest-dashboard is the actual hub.
const TABS = [
  { href: "/guest-dashboard", label: "Home", icon: House, exact: true, raised: false },
  { href: "/scan", label: "Scan", icon: ScanLine, exact: false, raised: true },
  { href: "/history", label: "History", icon: History, exact: false, raised: false },
  { href: "/learn", label: "Learn", icon: BookOpen, exact: false, raised: false },
]

const HIDDEN_PREFIXES = ["/admin", "/onboarding", "/register", "/login", "/auth"]

export function BottomNav() {
  const pathname = usePathname()
  const hiddenByPage = useSyncExternalStore(
    subscribeToNav,
    getNavHiddenSnapshot,
    getNavHiddenServerSnapshot
  )
  if (hiddenByPage) return null
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex h-16 w-full max-w-[402px] items-stretch px-5">
          {TABS.map((tab) => {
            const active = tab.exact
              ? pathname === tab.href
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
            const Icon = tab.icon

            if (tab.raised) {
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className="relative flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5 pb-2 text-[11px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span className="absolute -top-4 flex size-12 items-center justify-center rounded-full bg-gcheck-accent text-white shadow-md ring-4 ring-surface">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className={active ? "text-gcheck-accent" : "text-gcheck-body"}>
                    {tab.label}
                  </span>
                </Link>
              )
            }

            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                  active ? "text-gcheck-accent" : "text-gcheck-body hover:text-foreground"
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {tab.label}
              </Link>
            )
          })}
        </div>
      </nav>
      <div aria-hidden="true" className="h-16 pb-[env(safe-area-inset-bottom)]" />
    </>
  )
}
