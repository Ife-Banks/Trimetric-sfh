"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, Bell, ChevronRight, Clock3, House, LogOut, Settings } from "lucide-react"
import { toast } from "sonner"
import { getSupabaseAuthBrowser } from "@/lib/supabase/auth-client"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

// The app's top bar.
//
// MUTAGENIC is the umbrella brand and "GMO Check" / "Fluoride Scan" are its two
// flows, so the bar has two shapes and never both at once:
//   • home        — the MUTAGENIC wordmark, notifications, account avatar
//   • any screen  — a back button and that screen's own title
// Wordmark + back + title does not fit the 362pt of content a 402pt viewport
// gives (it needs ~300pt before the title is drawn), which is why `title`
// selects the shape rather than layering on top of it.
//
// Two deliberate departures from the mock, both about not shipping dead UI:
//   • the back arrow is opt-in per screen (`showBack`) — the mock is a
//     navigable prototype, so every frame carries one.
//   • the avatar opens the account sheet, which is where sign-out lives. The
//     mock's hamburger is gone because the tab bar covers navigation.
export function DashboardHeader({
  title,
  showBack = false,
  profileName,
  email,
}: {
  /** Omit on the home screen to get the umbrella wordmark instead. */
  title?: string
  showBack?: boolean
  profileName: string
  email: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const initial = profileName.trim().charAt(0).toUpperCase()

  async function signOut() {
    const { error } = await getSupabaseAuthBrowser().auth.signOut()
    if (error) {
      toast.error("Could not sign out", { description: error.message })
      return
    }
    setOpen(false)
    router.replace("/onboarding")
    router.refresh()
  }

  // Solid white, not translucent: the design's header is an opaque white bar
  // with no rule under it (the canvas behind it is #faf8ff, so the edge reads
  // on its own). A translucent + backdrop-blurred header also failed to paint
  // in Chromium surface captures, which made it impossible to verify.
  return (
    <header className="sticky top-0 z-30 bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-[402px] items-center gap-2 px-5">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 size-11 shrink-0 text-foreground"
            aria-label="Go back"
            onClick={() => router.back()}
          >
            <ArrowLeft className="size-5" />
          </Button>
        )}

        {title ? (
          <h1 className="truncate text-[16px] font-semibold leading-6 tracking-[-0.1px] text-primary">
            {title}
          </h1>
        ) : (
          <Link
            href="/guest-dashboard"
            className="flex min-w-0 items-center gap-2"
            aria-label="Mutagenic home"
          >
            <Image
              src="/figma/mutagenic-logo.png"
              alt=""
              width={36}
              height={34}
              className="h-[34px] w-9 shrink-0 object-contain"
              priority
            />
            <span className="truncate text-[16px] font-extrabold tracking-[-0.2px] text-wordmark">
              MUTAGENIC
            </span>
          </Link>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-gcheck-body"
            aria-label="Notifications"
            onClick={() => toast("No new notifications", { description: "Scan results appear here as they land." })}
          >
            <Bell className="size-5" />
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 p-0"
                aria-label="Open account menu"
              >
                {initial ? (
                  <span
                    className="flex size-8 items-center justify-center rounded-full bg-gcheck-tint text-[13px] font-bold text-primary"
                    aria-hidden="true"
                  >
                    {initial}
                  </span>
                ) : (
                  <Image
                    src="/figma/gmo-check-avatar.png"
                    alt=""
                    width={32}
                    height={32}
                    className="size-8 rounded-full"
                  />
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-[402px] rounded-none border-0 bg-surface p-5 text-foreground">
              <SheetTitle className="sr-only">Account menu</SheetTitle>
              <SheetDescription className="sr-only">Account details and app navigation</SheetDescription>

              <div className="flex h-10 items-center gap-2">
                <Image
                  src="/figma/mutagenic-logo.png"
                  alt="Mutagenic"
                  width={36}
                  height={34}
                  className="h-[34px] w-9 object-contain"
                />
                <span className="text-[15px] font-extrabold tracking-[-0.2px] text-wordmark">
                  MUTAGENIC
                </span>
              </div>

              <section className="mt-5 rounded-md bg-gcheck-tint p-3" aria-label="Account">
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-12 items-center justify-center rounded-full bg-surface text-[15px] font-bold text-primary shadow-xs"
                    aria-hidden="true"
                  >
                    {initial || "G"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{profileName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{email ?? "Guest session"}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-full bg-gcheck-mint/50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.04em] text-gcheck-pill-ink">
                    {email ? "Member account" : "Guest access"}
                  </span>
                </div>
              </section>

              <nav className="mt-5 space-y-2" aria-label="Menu">
                <SheetClose asChild>
                  <Link href="/guest-dashboard" className="flex h-12 items-center gap-3 rounded-md bg-gcheck-tint px-3 text-[14px] font-semibold text-primary">
                    <span className="flex size-7 items-center justify-center rounded-sm bg-primary text-primary-foreground"><House className="size-4" /></span>
                    Home
                    <ChevronRight className="ml-auto size-4 rotate-180 text-muted-foreground" />
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link href="/history" className="flex h-12 items-center gap-3 rounded-md px-3 text-[14px] font-semibold hover:bg-muted">
                    <span className="flex size-7 items-center justify-center rounded-sm bg-muted text-gcheck-body"><Clock3 className="size-4" /></span>
                    History
                    <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link href="/settings" className="flex h-12 items-center gap-3 rounded-md px-3 text-[14px] font-semibold hover:bg-muted">
                    <span className="flex size-7 items-center justify-center rounded-sm bg-muted text-gcheck-body"><Settings className="size-4" /></span>
                    Settings
                    <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                  </Link>
                </SheetClose>
              </nav>

              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-12 flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-[14px] font-semibold text-destructive hover:bg-destructive/10"
              >
                <span className="flex size-7 items-center justify-center rounded-sm bg-destructive/10"><LogOut className="size-4" /></span>
                Log Out
                <ChevronRight className="ml-auto size-4 text-muted-foreground" />
              </button>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
