"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import { Ghost } from "lucide-react"
import { ProviderGlyph, providerLabel, type OAuthProvider } from "@/components/auth/ProviderGlyph"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"

// Shared chrome for the two public auth screens (/register and /login). In the
// design file both frames are the same shell — gradient panel, brand mark, "or"
// divider, guest escape hatch and the three circular OAuth buttons — with only
// the form between the mark and the divider differing. 08_DESIGN_SYSTEM §3:
// one definition, reused, never forked per-screen.
export type AuthBusy = OAuthProvider | "email" | null

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="flex-1 bg-brand-gradient outline-none">
      <div className="mx-auto flex w-full max-w-sm flex-col px-5 py-10 md:px-8">{children}</div>
    </main>
  )
}

// The logo asset is shared with the home hub; the frame crops it to the
// tooth-and-leaf mark so the asset's "VERIFIED" baseline never shows. The
// percentages are the frame's own crop geometry — they scale with the box, so
// the mark stays square at any size.
export function AuthBrandMark({ tagline }: { tagline: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="relative block h-[95px] w-[100px] overflow-hidden" aria-hidden="true">
        <Image
          src="/figma/home-logo.png"
          alt=""
          width={500}
          height={500}
          priority
          className="absolute -left-[48.44%] -top-[39.92%] h-[205.76%] w-[195.31%] max-w-none"
        />
      </span>
      <h1 className="mt-1 text-center text-display font-bold tracking-tight text-primary">
        MUTAGENIC
      </h1>
      <p className="mt-1 text-center text-body text-foreground">{tagline}</p>
    </div>
  )
}

export function AuthOrDivider() {
  return (
    <div className="mt-3 flex items-center gap-3">
      <Separator className="flex-1" />
      <p className="text-h3 text-muted-foreground">or</p>
      <Separator className="flex-1" />
    </div>
  )
}

export function AuthGuestButton({ busy, onPress }: { busy: AuthBusy; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={busy !== null}
      className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 text-body font-semibold text-primary underline underline-offset-4 outline-none transition-colors hover:text-primary/80 disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Ghost className="size-5" aria-hidden="true" />
      Continue as Guest
    </button>
  )
}

export function AuthProviderButtons({
  busy,
  onSelect,
}: {
  busy: AuthBusy
  onSelect: (provider: OAuthProvider) => void
}) {
  return (
    <div className="mt-3 flex items-center justify-center gap-8">
      {(["google", "facebook", "apple"] as const).map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-14 rounded-full"
          onClick={() => onSelect(provider)}
          disabled={busy !== null}
          aria-label={`Continue with ${providerLabel(provider)}`}
        >
          {busy === provider ? (
            <Spinner className="size-5" />
          ) : (
            <ProviderGlyph provider={provider} className="size-5 shrink-0" />
          )}
        </Button>
      ))}
    </div>
  )
}
