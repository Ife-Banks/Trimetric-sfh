"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ClipboardList, ShieldCheck, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"

// Admin navigation. Below xl it's a horizontal segmented bar; from xl up it
// becomes the sidebar column (08 "Admin" nav variation) inside the admin
// layout's aside. Server layout passes showManage so the superadmin-only tab
// renders only for superadmins; the active state stays client-side.

interface AdminTab {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
}

export function AdminNav({ showManage, className }: { showManage: boolean; className?: string }) {
  const pathname = usePathname()
  const tabs: AdminTab[] = [
    {
      href: "/admin",
      label: "Review queue",
      icon: ClipboardList,
      active: pathname === "/admin",
    },
    ...(showManage
      ? [
          {
            href: "/admin/admins",
            label: "Manage admins",
            icon: ShieldCheck,
            active: pathname.startsWith("/admin/admins"),
          },
        ]
      : []),
  ]

  return (
    <nav
      className={cn(
        "flex flex-wrap gap-1 rounded-lg border bg-surface/70 p-1 xl:flex-col",
        className
      )}
      aria-label="Admin"
    >
      {tabs.map((tab) => (
        <Button
          key={tab.href}
          asChild
          variant="ghost"
          size="sm"
          className={cn(
            "flex-1 rounded-md text-muted-foreground transition-[background-color,box-shadow,color] xl:w-full xl:flex-none xl:justify-start",
            tab.active && "bg-background text-foreground shadow-xs"
          )}
          aria-current={tab.active ? "page" : undefined}
        >
          <Link href={tab.href}>
            <tab.icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{tab.label}</span>
          </Link>
        </Button>
      ))}
    </nav>
  )
}