"use client"

import { useState } from "react"
import { createAdminPayloadSchema } from "@/lib/validation/schemas"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { InlineAlert } from "@/components/ui/inline-alert"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function CreateAdminForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<"idle" | "busy" | "success" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)

    const parsed = createAdminPayloadSchema.safeParse({ email, password })
    if (!parsed.success) {
      setStatus("error")
      setMessage(parsed.error.issues[0]?.message ?? "Check the form fields.")
      return
    }
    const payload = parsed.data

    setStatus("busy")
    const res = await fetch("/api/admin/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => null)) as { message?: string } | null
    if (!res.ok) {
      setStatus("error")
      setMessage(data?.message ?? "Could not create the account.")
      return
    }
    setStatus("success")
    setMessage(`Reviewer account created for ${payload.email}.`)
    toast.success("Reviewer account created", { description: payload.email })
    setEmail("")
    setPassword("")
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
      <Field label="Email" htmlFor="new-admin-email">
        <Input
          id="new-admin-email"
          type="email"
          autoComplete="off"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field
        label="Initial password"
        htmlFor="new-admin-password"
        helper="At least 8 characters. Share it securely; the admin can reset it later."
      >
        <Input
          id="new-admin-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {message &&
        (status === "error" ? (
          <InlineAlert variant="destructive">{message}</InlineAlert>
        ) : (
          <InlineAlert variant="success">{message}</InlineAlert>
        ))}
      <Button type="submit" className="w-full" disabled={status === "busy"}>
        {status === "busy" ? (
          <>
            <Spinner /> Creating…
          </>
        ) : (
          "Create admin account"
        )}
      </Button>
    </form>
  )
}