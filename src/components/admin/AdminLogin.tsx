"use client"

// Shown by the server layout when there is no session. Signing in writes the
// cookie session @supabase/ssr needs; router.refresh() then re-runs the server
// layout, which reads profiles.role and admits admins only (SEC-03).

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseAuthBrowser } from "@/lib/supabase/auth-client"

export function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: signInError } = await getSupabaseAuthBrowser().auth.signInWithPassword({
      email,
      password,
    })
    if (signInError) {
      setError(signInError.message)
      setBusy(false)
      return
    }
    router.refresh()
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-xl font-semibold">Admin sign in</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Reviewer access only. Your role is checked server-side against the profiles table.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
        <div>
          <label htmlFor="admin-email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label htmlFor="admin-password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        {error && (
          <p role="alert" aria-live="assertive" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="h-11 w-full rounded-full bg-zinc-900 text-sm font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  )
}