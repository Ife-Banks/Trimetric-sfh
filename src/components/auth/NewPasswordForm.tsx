"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { getSupabaseAuthBrowser } from "@/lib/supabase/auth-client"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { InlineAlert } from "@/components/ui/inline-alert"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function NewPasswordForm() {
  const searchParams = useSearchParams()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [status, setStatus] = useState<"exchanging" | "ready" | "success" | "error">("exchanging")
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let ignore = false
    async function prepare() {
      const supabase = getSupabaseAuthBrowser()
      const code = searchParams.get("code")
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          if (!ignore) {
            setStatus("error")
            setMessage(error.message)
          }
          return
        }
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (ignore) return
      if (!user) {
        setStatus("error")
        setMessage("This password-reset link is invalid or has expired. Request a new one.")
        return
      }
      setStatus("ready")
    }
    void prepare()
    return () => {
      ignore = true
    }
  }, [searchParams])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    if (password !== confirm) {
      setMessage("Passwords do not match.")
      return
    }
    setBusy(true)
    const supabase = getSupabaseAuthBrowser()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setMessage(error.message)
      setBusy(false)
      return
    }
    await supabase.auth.signOut()
    setBusy(false)
    setStatus("success")
  }

  if (status === "exchanging") {
    return <p className="mt-6 text-sm text-muted-foreground">Verifying your link…</p>
  }

  if (status === "error") {
    return (
      <div className="mt-6">
        <InlineAlert variant="destructive">{message}</InlineAlert>
      </div>
    )
  }

  if (status === "success") {
    return (
      <div className="mt-6 rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
        Password updated. Sign in with your new password.
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
      <Field label="New password" htmlFor="reset-password">
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Confirm password" htmlFor="reset-confirm" helper="At least 8 characters.">
        <Input
          id="reset-confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      {message && <InlineAlert variant="destructive">{message}</InlineAlert>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? (
          <>
            <Spinner /> Updating…
          </>
        ) : (
          "Update password"
        )}
      </Button>
    </form>
  )
}