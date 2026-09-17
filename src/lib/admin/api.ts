import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getUserServerSupabase } from "@/lib/supabase/server"

export interface AdminSession {
  supabase: SupabaseClient
  userId: string
  email: string | null
}

export type AdminGuardResult = AdminSession | { response: Response }

// Server-side admin gate for every /api/admin/* handler (SEC-10: UI gating is
// not access control — re-verify the session and role on the server before
// acting). The role is read from `profiles`, never auth metadata, and the
// database enforces the same rule again via RLS / approve_submission().
export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = await getUserServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { response: Response.json({ error: "unauthorized" }, { status: 401 }) }
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()

  if (profile?.role !== "admin") {
    return { response: Response.json({ error: "forbidden" }, { status: 403 }) }
  }

  return { supabase, userId: user.id, email: user.email ?? null }
}

export function isAdminSession(result: AdminGuardResult): result is AdminSession {
  return "supabase" in result
}