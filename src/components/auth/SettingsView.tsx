"use client"

import { useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { LogOut, ScanEye, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { getSupabaseAuthBrowser } from "@/lib/supabase/auth-client"
import {
  getDefaultCategoryServerSnapshot,
  getDefaultCategorySnapshot,
  subscribeToPreferences,
  writeDefaultCategory,
  type DefaultCategory,
} from "@/lib/preferences"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/ui/panel"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function SettingsView({
  email,
  isAdmin,
}: {
  email: string | null
  isAdmin: boolean
}) {
  const router = useRouter()
  // useSyncExternalStore rather than useState + effect. Reading storage in a
  // useState initializer runs during SSR (window is undefined, the throw is
  // swallowed, "gmo" is returned), so a user whose stored default was
  // "fluoride" got "Food (GMO)" in the SSR markup and "Oral care (fluoride)"
  // at hydration.
  const storedCategory = useSyncExternalStore(
    subscribeToPreferences,
    getDefaultCategorySnapshot,
    getDefaultCategoryServerSnapshot
  )
  const [pendingCategory, setPendingCategory] = useState<DefaultCategory | null>(null)
  const defaultCategory = pendingCategory ?? storedCategory

  async function signOut() {
    await getSupabaseAuthBrowser().auth.signOut()
    toast.success("Signed out")
    // Straight to /onboarding, not "/". "/" redirects here anyway, so going
    // through it was a second server round trip for the same destination —
    // and the two sign-out buttons in the app (this one and the account
    // sheet's) now land on the same screen.
    router.replace("/onboarding")
    router.refresh()
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Diagnostic Preferences — Figma 127:265. The default category /scan
          routes to when no ?category param is present. Local-only preference;
          changes take effect on the next scan. */}
      <Panel variant="hairline" padding="md" className="space-y-4">
        <div className="flex items-center gap-2.5">
          <ScanEye className="size-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">Diagnostic Preferences</h2>
            <p className="text-xs text-muted-foreground">
              What the scan screen opens to by default.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="default-category" className="text-sm">
            Default scan type
          </label>
          <Select
            value={defaultCategory}
            onValueChange={(value: DefaultCategory) => {
              setPendingCategory(value)
              writeDefaultCategory(value)
              toast.success(
                value === "fluoride" ? "Default set to oral care" : "Default set to food"
              )
            }}
          >
            <SelectTrigger id="default-category" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gmo">Food (GMO)</SelectItem>
              <SelectItem value="fluoride">Oral care (fluoride)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Panel>

      {email ? (
        <Panel variant="hairline" padding="md" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{email}</p>
              <p className="text-xs text-muted-foreground">Signed in</p>
            </div>
            {isAdmin && (
              <StatusBadge variant="info">
                <ShieldCheck aria-hidden="true" />
                Reviewer
              </StatusBadge>
            )}
          </div>
          {isAdmin && (
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">Open review console</Link>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Log out of MUTAGENIC
          </Button>
        </Panel>
      ) : (
        <Panel variant="hairline" padding="md" className="space-y-4">
          <div>
            <p className="text-sm font-semibold">You&apos;re scanning as a guest</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Scanning works with no account. Sign in to keep the corrections you propose.
            </p>
          </div>
          <Button asChild size="lg" className="w-full">
            <Link href="/login">Sign in</Link>
          </Button>
        </Panel>
      )}

      <p className="text-xs text-muted-foreground">
        The corrections you propose appear under the Contributions tab once you&apos;re signed in.
      </p>
    </div>
  )
}