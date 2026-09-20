"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { getSupabaseAuthBrowser } from "@/lib/supabase/auth-client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { InlineAlert } from "@/components/ui/inline-alert"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"

// Two-entry sign-in:
//   - Continue with Google — for normal users (anonymous-first app; accounts
//     just unlock scan history). PKCE flow → /auth/callback exchanges the code.
//   - Email + password — for admins. Admin accounts are created by a
//     superadmin, there is no public email sign-up, so a failed password sign-in
//     here means "ask your superadmin" rather than "create an account".
export function SignInForm({ next, error }: { next: string; error: string | null }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"google" | "email" | null>(null)

  const resolvedError = error ?? formError

  function googleRedirectUrl(): string {
    const callback = new URL(window.location.origin)
    callback.pathname = "/auth/callback"
    if (next !== "/") callback.searchParams.set("next", next)
    return callback.toString()
  }

  async function continueWithGoogle() {
    setBusy("google")
    setFormError(null)
    const { error: oauthError } = await getSupabaseAuthBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: googleRedirectUrl() },
    })
    if (oauthError) {
      setFormError(oauthError.message)
      toast.error("Could not start Google sign-in", { description: oauthError.message })
      setBusy(null)
    }
  }

  async function signInWithEmail(event: React.FormEvent<HTMLFormElement>) {
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
    router.replace(next)
    router.refresh()
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16 outline-none">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">Sign in to SHF</CardTitle>
          <CardDescription>
            Scanning works with no account. Sign in to keep track of what you&apos;ve checked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => void continueWithGoogle()}
            disabled={busy !== null}
          >
            {busy === "google" ? (
              <>
                <Spinner /> Opening Google…
              </>
            ) : (
              "Continue with Google"
            )}
          </Button>

          <Separator />

          <form onSubmit={(e) => void signInWithEmail(e)} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              This is the reviewer sign-in. Admin accounts are provisioned by your superadmin — there
              is no public email sign-up.
            </p>
            <Field label="Email" htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
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
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Forgot your password?
              </Link>
            </div>
            {resolvedError && <InlineAlert variant="destructive">{resolvedError}</InlineAlert>}
            <Button type="submit" size="lg" className="w-full" disabled={busy !== null}>
              {busy === "email" ? (
                <>
                  <Spinner /> Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}