"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { LogOut, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { getSupabaseAuthBrowser } from "@/lib/supabase/auth-client"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/ui/panel"
import { StatusBadge } from "@/components/ui/status-badge"

export function SettingsView({
  email,
  isAdmin,
}: {
  email: string | null
  isAdmin: boolean
}) {
  const router = useRouter()

  async function signOut() {
    await getSupabaseAuthBrowser().auth.signOut()
    toast.success("Signed out")
    router.replace("/")
    router.refresh()
  }

  return (
    <div className="mt-6 space-y-4">
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
            Sign out
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
        The corrections you propose appear under the Submissions tab once you&apos;re signed in.
      </p>
    </div>
  )
}