"use client"

import { useState } from "react"
import { getSupabaseAuthBrowser } from "@/lib/supabase/auth-client"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { InlineAlert } from "@/components/ui/inline-alert"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { MailCheck } from "lucide-react"

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const redirectTo = new URL("/auth/reset-password", window.location.origin).toString()
    const { error: resetError } = await getSupabaseAuthBrowser().auth.resetPasswordForEmail(email, {
      redirectTo,
    })
    if (resetError) {
      setError(resetError.message)
      setBusy(false)
      return
    }
    setSent(true)
    setBusy(false)
  }

  if (sent) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
        If an account exists for <span className="font-medium">{email}</span>, a reset link is on
        its way. Follow it to choose a new password.
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
      <Field label="Email" htmlFor="forgot-email">
        <Input
          id="forgot-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      {error && <InlineAlert variant="destructive">{error}</InlineAlert>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? (
          <>
            <Spinner /> Sending…
          </>
        ) : (
          <>
            <MailCheck className="size-4" aria-hidden="true" />
            Send reset link
          </>
        )}
      </Button>
    </form>
  )
}