"use client"

// MUTAGENIC's bottom tab bar. Two shapes, chosen by route:
//
//   • hub  — /guest-dashboard and /settings: Home / History / Settings.
//   • flow — every other in-app screen:      Home / Scan / History / Learn.
//
// The ACTIVE tab is the one whose route matches, and it is the tab that gets the
// big popping-out circular icon. That treatment used to be hardcoded onto Scan,
// so Scan wore the raised circle on every page and read as the selected tab even
// when you were nowhere near /scan. Active is now derived from the pathname only,
// which also means that on /gmo — which is not itself a tab — nothing looks
// selected.
//
// The bar is visible on every in-app screen. It is not shown on the pre-auth
// entry screens, nor on /admin, which has its own navigation.
//
// A spacer of the same height follows the bar so its fixed positioning never
// covers the last row of a page's content.

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, History, House, ScanLine, Settings, type LucideIcon } from "lucide-react"
import { cn } from "cn"

interface NavTab {
  href: string
  label: string
  icon: LucideIcon
  /** Match the pathname exactly rather than by prefix. */
  exact?: boolean
}

// Home points at /guest-dashboard, NOT "/". The root path unconditionally
// redirects to /onboarding, and /onboarding hides this nav — so a "Home" tab
// linking to "/" dumped people into the carousel with no way out.
const HUB_TABS: NavTab[] = [
  { href: "/guest-dashboard", label: "Home", icon: House, exact: true },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
]

const FLOW_TABS: NavTab[] = [
  { href: "/guest-dashboard", label: "Home", icon: House, exact: true },
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/history", label: "History", icon: History },
  { href: "/learn", label: "Learn", icon: BookOpen },
]

const HIDDEN_PREFIXES = ["/admin", "/onboarding", "/register", "/login", "/auth"]

// Settings lives in the hub bar, so the hub bar has to stay on /settings too.
// Scoping it to /guest-dashboard alone meant tapping Settings swapped in the flow
// bar — which has no Settings tab — and the tab you had just used vanished from
// under you.
function isHubRoute(pathname: string): boolean {
  return pathname === "/guest-dashboard" || pathname === "/settings"
}

function isActive(tab: NavTab, pathname: string): boolean {
  return tab.exact
    ? pathname === tab.href
    : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
}

export function BottomNav() {
  const pathname = usePathname()
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null

  const tabs = isHubRoute(pathname) ? HUB_TABS : FLOW_TABS

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex h-16 w-full max-w-[402px] items-stretch px-5">
          {tabs.map((tab) => {
            const active = isActive(tab, pathname)
            const Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-0 flex-1 flex-col items-center text-[11px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                  active
                    ? "justify-end gap-0.5 pb-2 text-gcheck-accent"
                    : "justify-center gap-1 text-gcheck-body hover:text-foreground"
                )}
              >
                {active ? (
                  // The popping-out circular icon IS the active state.
                  <span className="absolute -top-4 flex size-12 items-center justify-center rounded-full bg-gcheck-accent text-white shadow-md ring-4 ring-surface">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                ) : (
                  <Icon className="size-5" aria-hidden="true" />
                )}
                <span className="truncate">{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
      <div aria-hidden="true" className="h-16 pb-[env(safe-area-inset-bottom)]" />
    </>
  )
}
