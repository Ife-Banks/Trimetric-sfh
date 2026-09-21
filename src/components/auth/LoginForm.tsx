"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { getSupabaseAuthBrowser } from "@/lib/supabase/auth-client"
import { providerLabel, type OAuthProvider } from "@/components/auth/ProviderGlyph"
import {
  AuthBrandMark,
  AuthGuestButton,
  AuthOrDivider,
  AuthProviderButtons,
  AuthScreen,
  type AuthBusy,
} from "@/components/auth/AuthScreen"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { InlineAlert } from "@/components/ui/inline-alert"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

// Public login, and the app's single email + password entry point — members and
// admins both sign in here. Admin *authority* is still decided by
// profiles.role (04 §1, 06 §5), never by which form was used: this screen only
// authenticates, the /admin layout and the /api/admin/* handlers authorise.
// Facebook/Apple depend on those providers being enabled in the Supabase
// dashboard (dashboard config, not a migration).
const HUB_PATH = "/guest-dashboard"

export function LoginForm({ next, error }: { next: string; error: string | null }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<AuthBusy>(null)

  // A server-supplied error (from /auth/callback) wins until the user tries
  // again, at which point their own attempt's message is the relevant one.
  const resolvedError = error ?? formError

  function authCallbackUrl(): string {
    const callback = new URL(window.location.origin)
    callback.pathname = "/auth/callback"
    callback.searchParams.set("next", next)
    return callback.toString()
  }

  async function continueWithOAuth(provider: OAuthProvider) {
    setBusy(provider)
    setFormError(null)
    const { error: oauthError } = await getSupabaseAuthBrowser().auth.signInWithOAuth({
      provider,
      options: { redirectTo: authCallbackUrl() },
    })
    if (oauthError) {
      setFormError(oauthError.message)
      toast.error(`Could not start ${providerLabel(provider)} sign-in`, {
        description: oauthError.message,
      })
      setBusy(null)
    }
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy("email")
    setFormError(null)
    const { error: signInError } = await getSupabaseAuthBrowser().auth.signInWithPassword({
      email,
      password,
    })
    if (signInError) {
      setFormError(signInError.message)
      toast.error("Sign in failed", { description: signInError.message })
      setBusy(null)
      return
    }
    // `next` reached the server through safeNextPath() before this screen
    // rendered, so it is already a same-origin path. It is not used for the
    // guest shortcut below, which always ends at the hub — a guest following a
    // member-only `next` would only be bounced back here.
    router.replace(next)
    router.refresh()
  }

  return (
    <AuthScreen>
      <AuthBrandMark tagline="Good to see you again" />

      <form onSubmit={(e) => void signIn(e)} className="mt-8 space-y-4">
        <Field label="E-mail" htmlFor="login-email">
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="login-password">
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <div className="flex justify-end">
          <Link
            href="/auth/forgot"
            className="rounded-sm text-caption font-medium text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Forgot Password?
          </Link>
        </div>

        {resolvedError && <InlineAlert variant="destructive">{resolvedError}</InlineAlert>}

        <Button type="submit" size="lg" className="w-full rounded-md" disabled={busy !== null}>
          {busy === "email" ? (
            <>
              <Spinner /> Signing in…
            </>
          ) : (
            "Login"
          )}
        </Button>
      </form>

      <p className="mt-3 text-center text-body">
        <span className="text-foreground">Don&apos;t have an Account ?</span>{" "}
        <Link
          href="/register"
          className="font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Register
        </Link>
      </p>

      <AuthOrDivider />
      <AuthGuestButton busy={busy} onPress={() => router.push(HUB_PATH)} />
      <AuthProviderButtons busy={busy} onSelect={(provider) => void continueWithOAuth(provider)} />
    </AuthScreen>
  )
}
