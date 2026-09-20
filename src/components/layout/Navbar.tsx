"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import type { User } from "@supabase/supabase-js"
import { toast } from "sonner"
import { getSupabaseAuthBrowser } from "@/lib/supabase/auth-client"
import { ScanLine } from "lucide-react"
import { cn } from "cn"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"

// Site-wide navbar. Anonymous users get a plain "Sign in"; signed-in users get
// History + an avatar menu with their profile (email) and sign-out. Scan —
// the app's single primary action — is always present. Driven by
// onAuthStateChange so it reflects the real session without a full reload.
export function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let ignore = false
    const supabase = getSupabaseAuthBrowser()
    supabase.auth.getUser().then(({ data }) => {
      if (!ignore) {
        setUser(data.user ?? null)
        setLoaded(true)
      }
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!ignore) {
        setUser(session?.user ?? null)
        setLoaded(true)
      }
    })
    return () => {
      ignore = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await getSupabaseAuthBrowser().auth.signOut()
    setUser(null)
    toast.success("Signed out")
    router.replace("/")
    router.refresh()
  }

  const initials = user?.email?.[0]?.toUpperCase() ?? "?"
  const onHistory = pathname === "/history" || pathname.startsWith("/history")

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Image src="/icon.svg" alt="" width={26} height={26} className="rounded-md" priority />
          <span>SHF</span>
        </Link>

        <div className="flex items-center gap-1">
          {loaded && user && (
            <Button asChild variant="ghost" size="sm" className={cn(onHistory && "bg-accent")}>
              <Link href="/history">History</Link>
            </Button>
          )}

          <Button asChild size="sm" className="rounded-full px-4">
            <Link href="/scan">
              <ScanLine className="size-4" aria-hidden="true" />
              Scan
            </Link>
          </Button>

          {!loaded ? (
            <Skeleton className="ml-1 size-8 rounded-full" aria-label="Loading account" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label="Account menu"
                >
                  <Avatar>
                    <AvatarFallback className="bg-muted font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="truncate font-medium">{user.email}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">Signed in</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void signOut()}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link href="/auth/login">Sign in</Link>
            </Button>
          )}
        </div>
      </nav>
    </header>
  )
}