"use client"

// Bottom tab bar — the public app's primary navigation (08 §3 "Navigation"):
// Members see Home / Submissions / Settings; guests see Home only. Icons +
// labels use --primary for the active item and --muted-foreground otherwise.
// It is safe-area aware, while the pre-auth entry screens (onboarding, register,
// login) and the admin routes hide it entirely. "Submissions" is the tab —
// there is no separate scan log (Phase A prompt).

import Link from "next/link"
import { usePathname } from "next/navigation"
import { History, House, Settings } from "lucide-react"
import { cn } from "cn"

const MEMBER_TABS = [
  { href: "/", label: "Home", icon: House, exact: true },
  { href: "/history", label: "Submissions", icon: History, exact: false },
  { href: "/settings", label: "Settings", icon: Settings, exact: false },
]

const GUEST_TABS = [
  { href: "/guest-dashboard", label: "Home", icon: House, exact: true },
]

export function BottomNav() {
  const pathname = usePathname()
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/login")
  )
    return null
  const tabs = pathname.startsWith("/guest-dashboard") ? GUEST_TABS : MEMBER_TABS

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-surface pb-[env(safe-area-inset-bottom)] shadow-sm"
      >
        <div className="mx-auto flex h-16 max-w-md items-stretch">
          {tabs.map((tab) => {
            const active = tab.exact
              ? pathname === tab.href
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
            const Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
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
