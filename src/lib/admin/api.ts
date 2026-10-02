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
//
// Both "admin" and "superadmin" satisfy this gate. /admin/layout.tsx already
// admits both roles, so matching only the exact string "admin" here let a
// superadmin into the review queue and then 403'd every approve/reject/photo
// call they made.
const ADMIN_ROLES = new Set(["admin", "superadmin"]);

// SEC-11 / 05_SECURITY_ASSESSMENT.md checklist item 4: "MFA enabled on all
// admin accounts". Nothing in the codebase previously checked the session's
// authenticator assurance level, so a password-only session was treated as
// fully privileged everywhere.
//
// Enabled with ADMIN_MFA_REQUIRED=true. It defaults OFF because turning it on
// before MFA is enrolled for an existing admin would lock that admin out of
// their own review queue. To turn it on:
//   1. Supabase Dashboard → Authentication → MFA → enable TOTP
//   2. Enrol an authenticator for every admin + superadmin account
//   3. Set ADMIN_MFA_REQUIRED=true in the deployment environment
const MFA_REQUIRED = process.env.ADMIN_MFA_REQUIRED === "true";

type MfaFailure = { response: Response } | null;

async function checkMfa(
  supabase: SupabaseClient
): Promise<MfaFailure> {
  if (!MFA_REQUIRED) return null;
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    // aal1 = the current session only proves a password. Anything below
    // aal2 means no second factor was presented with this session.
    if (error || !data || data.currentLevel !== "aal2") {
      return {
        response: Response.json(
          {
            error: "mfa_required",
            message:
              "This session is not MFA-verified. Admin actions require a second factor.",
          },
          { status: 403 }
        ),
      };
    }
  } catch {
    // If the MFA check itself errors, fail closed — this is an admin-only path.
    return {
      response: Response.json(
        { error: "mfa_unavailable", message: "Could not verify MFA state." },
        { status: 503 }
      ),
    };
  }
  return null;
}

export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = await getUserServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { response: Response.json({ error: "unauthorized" }, { status: 401 }) }
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()

  if (!profile?.role || !ADMIN_ROLES.has(profile.role)) {
    return { response: Response.json({ error: "forbidden" }, { status: 403 }) }
  }

  const mfa = await checkMfa(supabase);
  if (mfa) return mfa;

  return { supabase, userId: user.id, email: user.email ?? null }
}

export function isAdminSession(result: AdminGuardResult): result is AdminSession {
  return "supabase" in result
}

// Same guard as requireAdmin but for superadmin-only actions (creating admin
// accounts). Reused by /api/admin/create and the /admin/admins page. Profiles
// are the source of truth, never auth metadata (SEC-03).
export async function requireSuperAdmin(): Promise<AdminGuardResult> {
  const supabase = await getUserServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { response: Response.json({ error: "unauthorized" }, { status: 401 }) }
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()

  if (profile?.role !== "superadmin") {
    return { response: Response.json({ error: "forbidden" }, { status: 403 }) }
  }

  const mfa = await checkMfa(supabase);
  if (mfa) return mfa;

  return { supabase, userId: user.id, email: user.email ?? null }
}