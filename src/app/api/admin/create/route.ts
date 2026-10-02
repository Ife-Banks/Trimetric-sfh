import "server-only"

import { requireSuperAdmin, isAdminSession } from "@/lib/admin/api"
import { correlationId, serverError } from "@/lib/api/http"
import { getSupabaseAdmin } from "@/lib/supabase/server"
import { createAdminPayloadSchema } from "@/lib/validation/schemas"

// Superadmin-only: create an admin account (email + password). Normal users
// sign up themselves via Google; admin accounts are always provisioned here so
// the reviewer role stays invite-only. Uses the service-role client (server
// only) to create the auth user, then elevates their auto-created profile.
export async function POST(request: Request) {
  const correlation = correlationId()

  const guard = await requireSuperAdmin()
  if (!isAdminSession(guard)) return guard.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid_json", message: "Request body is not valid JSON" }, { status: 400 })
  }

  const parsed = createAdminPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 422 }
    )
  }
  const { email, password } = parsed.data

  const admin = getSupabaseAdmin()

  // email_confirm: true so the reviewer can sign in immediately — the
  // superadmin has already vetted them, no confirmation email required.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) {
    // A duplicate email is a legitimate user-facing case, so surface that one
    // specifically; everything else stays generic (SEC-14).
    const isDuplicate = /already|registered|exists/i.test(error.message)
    return serverError(
      "admin.create_user",
      error,
      isDuplicate ? 409 : 400,
      isDuplicate ? "email_already_registered" : "create_failed",
      isDuplicate ? "An account already exists for that email address." : "The admin account could not be created.",
      correlation
    )
  }
  const userId = data.user.id

  // The on_auth_user_created trigger already inserted a 'user' profile; elevate
  // it to 'admin'. Service role bypasses RLS, but the role table is still the
  // source of truth.
  const { error: profileError } = await admin.from("profiles").upsert(
    { id: userId, role: "admin" },
    { onConflict: "id" }
  )

  if (profileError) {
    await admin.auth.admin.deleteUser(userId).catch(() => {})
    return serverError(
      "admin.upsert_profile",
      profileError,
      500,
      "profile_failed",
      "Account created but role could not be assigned.",
      correlation
    )
  }

  // No X-RateLimit-Remaining header: this endpoint has no limiter, so claiming
  // a remaining quota of "0" was misleading. Access is superadmin-gated.
  return Response.json({ ok: true, email, correlation }, { status: 201 })
}