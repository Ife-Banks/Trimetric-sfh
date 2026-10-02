"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MailCheck } from "lucide-react"
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

// Public registration — the destination the onboarding carousel hands off to.
// Creating an account is entirely optional: the anonymous scan flow needs no
// account at all, so "Continue as Guest" and the three OAuth providers sit on
// the same screen as the email form and all four land on the same hub.
//
// The email path is a real signup (supabase `enable_signup` is on) and can only
// ever create a 'user' profile — roles live in the `profiles` table and are set
// by a superadmin, never by the client (06_AGENT_CONTEXT §2). The "User Name"
// field has no column to live in (`profiles` is id/role only), so it rides
// along as user metadata rather than inventing a migration for a value nothing
// reads yet.
const HUB_PATH = "/guest-dashboard"
const TAGLINE = "Take control of what you consume"
// Supabase rejects anything shorter (config.toml `minimum_password_length`);
// mirrored here so the user hears it before a round trip.
const MIN_PASSWORD_LENGTH = 6

export function RegisterForm() {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<AuthBusy>(null)
  const [confirmSent, setConfirmSent] = useState(false)

  function authCallbackUrl(next: string): string {
    const callback = new URL(window.location.origin)
    callback.pathname = "/auth/callback"
    callback.searchParams.set("next", next)
    return callback.toString()
  }

  async function continueWithOAuth(provider: OAuthProvider) {
    setBusy(provider)
    setFormError(null)
    const { error } = await getSupabaseAuthBrowser().auth.signInWithOAuth({
      provider,
      options: { redirectTo: authCallbackUrl(HUB_PATH) },
    })
    if (error) {
      setFormError(error.message)
      toast.error(`Could not start ${providerLabel(provider)} sign-up`, {
        description: error.message,
      })
      setBusy(null)
    }
  }

  async function register(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== confirmPassword) {
      setFormError("Those passwords don't match.")
      return
    }
    setBusy("email")
    setFormError(null)
    const { data, error } = await getSupabaseAuthBrowser().auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: authCallbackUrl(HUB_PATH),
      },
    })
    if (error) {
      setFormError(error.message)
      toast.error("Could not create your account", { description: error.message })
      setBusy(null)
      return
    }
    // With email confirmation switched on the account exists but can't sign in
    // until the link in the inbox is followed — there's no session yet, so
    // navigating would bounce straight back here.
    if (!data.session) {
      setConfirmSent(true)
      setBusy(null)
      return
    }
    router.replace(HUB_PATH)
    router.refresh()
  }

  if (confirmSent) {
    return (
      <AuthScreen
        className="mx-auto min-h-[960px] w-full max-w-[402px] text-ink-strong"
        contentClassName="px-5 pt-[76px] pb-8 md:px-5"
        style={{ background: "linear-gradient(180deg, var(--mint) 0%, var(--brand-wash) 100%)", colorScheme: "light" }}
      >
        <AuthBrandMark tagline={TAGLINE} titleClassName="text-emerald-mid" taglineClassName="text-[12px] text-ink-strong" />
        <div className="mt-8 rounded-lg border border-border bg-surface p-4 text-center">
          <MailCheck className="mx-auto size-8 text-success" aria-hidden="true" />
          <p className="mt-3 text-body-strong">Confirm your email</p>
          <p className="mt-1 text-caption text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
            Follow it to finish setting up your account.
          </p>
        </div>
        <Button asChild size="lg" className="mt-4 w-full rounded-md">
          <Link href={HUB_PATH}>Continue as Guest</Link>
        </Button>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
      className="mx-auto min-h-[960px] w-full max-w-[402px] text-ink-strong"
      contentClassName="px-5 pt-[76px] pb-8 md:px-5"
      style={{ background: "linear-gradient(180deg, var(--mint) 0%, var(--brand-wash) 100%)", colorScheme: "light" }}
    >
      <AuthBrandMark tagline={TAGLINE} titleClassName="text-emerald-mid" taglineClassName="text-[12px] text-ink-strong" />

      <form onSubmit={(e) => void register(e)} className="mt-12 space-y-[10px]">
        <Field label="User Name" htmlFor="register-name" className="space-y-1.5">
          <Input
            id="register-name"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="!h-[52px] rounded-[12px] border-emerald-mid !bg-surface/20 px-3 text-[14px] !text-ink-strong focus-visible:border-emerald-mid focus-visible:ring-emerald-mid/20"
          />
        </Field>

        <Field label="E-mail" htmlFor="register-email" className="space-y-1.5">
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="!h-[52px] rounded-[12px] border-emerald-mid !bg-surface/20 px-3 text-[14px] !text-ink-strong focus-visible:border-emerald-mid focus-visible:ring-emerald-mid/20"
          />
        </Field>

        <Field label="Password" htmlFor="register-password" className="space-y-1.5">
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="!h-[52px] rounded-[12px] border-emerald-mid !bg-surface/20 px-3 text-[14px] !text-ink-strong focus-visible:border-emerald-mid focus-visible:ring-emerald-mid/20"
          />
        </Field>

        <Field label="Confirm Password" htmlFor="register-confirm-password" className="space-y-1.5">
          <Input
            id="register-confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="!h-[52px] rounded-[12px] border-emerald-mid !bg-surface/20 px-3 text-[14px] !text-ink-strong focus-visible:border-emerald-mid focus-visible:ring-emerald-mid/20"
          />
        </Field>

        {formError && <InlineAlert variant="destructive">{formError}</InlineAlert>}

        <Button type="submit" size="lg" className="!h-[52px] w-full rounded-[12px] bg-brand-ink text-[14px] font-semibold uppercase !text-ink-on-brand hover:bg-brand-ink/90" disabled={busy !== null}>
          {busy === "email" ? (
            <>
              <Spinner /> Creating your account…
            </>
          ) : (
            "Register"
          )}
        </Button>
      </form>

      <p className="mt-3 text-center text-[14px] leading-5 text-ink-strong">
        <span>Already have an Account ?</span>{" "}
        <Link
          href="/login"
          className="ml-1 font-semibold text-emerald-mid underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Login
        </Link>
      </p>

      <AuthOrDivider className="mt-2" lineClassName="bg-emerald-mid" />
      <AuthGuestButton
        busy={busy}
        onPress={() => router.push(HUB_PATH)}
        className="mt-1 !min-h-11 text-[12px] font-semibold text-emerald-mid no-underline"
      />
      <AuthProviderButtons
        busy={busy}
        onSelect={(provider) => void continueWithOAuth(provider)}
        className="mt-2 gap-8 [&_button]:border-0 [&_button]:bg-surface [&_button]:text-ink-strong [&_button]:shadow-sm [&_button:hover]:bg-surface"
      />
    </AuthScreen>
  )
}
