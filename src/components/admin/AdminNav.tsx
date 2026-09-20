"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "cn"
import { Button } from "@/components/ui/button"

// Segmented admin tab bar. Server layout passes showManage so the superadmin-only
// tab renders only for superadmins, while the active state stays client-side.
export function AdminNav({ showManage, className }: { showManage: boolean; className?: string }) {
  const pathname = usePathname()
  const tabs = [
    { href: "/admin", label: "Review queue", active: pathname === "/admin" },
    {
      href: "/admin/admins",
      label: "Manage admins",
      active: pathname.startsWith("/admin/admins"),
      show: showManage,
    },
  ]

  return (
    <nav
      className={cn(
        "flex w-full gap-1 rounded-xl border bg-muted/50 p-1 sm:w-96",
        className
      )}
      aria-label="Admin"
    >
      {tabs
        .filter((t) => t.show)
        .map((tab) => (
          <Button
            key={tab.href}
            asChild
            variant="ghost"
            size="sm"
            className={cn(
              "flex-1 rounded-lg text-muted-foreground transition-[background-color,box-shadow,color]",
              tab.active && "bg-background text-foreground shadow-xs"
            )}
            aria-current={tab.active ? "page" : undefined}
          >
            <Link href={tab.href}>{tab.label}</Link>
          </Button>
        ))}
    </nav>
  )
}