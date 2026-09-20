import "server-only"

import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

function requireEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      "Supabase server client: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set"
    )
  }
  return { url, anonKey }
}

let anonymousServerClient: SupabaseClient | null = null

// Server-only ANON client (no user session). Used for anonymous writes such as
// POST /api/submissions, which RLS (`submissions_insert_anyone`) already gates.
// The service-role key (SUPABASE_SERVICE_ROLE_KEY, never NEXT_PUBLIC_) is NOT
// instantiated here — nothing in the MVP flow needs to bypass RLS.
export function getServerSupabase(): SupabaseClient {
  if (anonymousServerClient) return anonymousServerClient
  const { url, anonKey } = requireEnv()
  anonymousServerClient = createClient(url, anonKey)
  return anonymousServerClient
}

let adminServerClient: SupabaseClient | null = null

// SERVICE-ROLE client (SEC-01: never NEXT_PUBLIC_, never reaches the bundle —
// this module starts with `import "server-only"`). Used ONLY by the
// superadmin "create admin account" flow, which needs auth.admin.createUser()
// that the anon key cannot perform. Everything else uses the session client
// so Postgres sees the real auth.uid() and RLS applies.
export function getSupabaseAdmin(): SupabaseClient {
  if (adminServerClient) return adminServerClient
  const { url } = requireEnv()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error("Supabase admin client: SUPABASE_SERVICE_ROLE_KEY must be set")
  }
  adminServerClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return adminServerClient
}

// Cookie-bound client carrying the signed-in user's session. Every admin
// decision uses THIS client so Postgres sees the real auth.uid() and the
// `profiles.role` check in is_admin() actually applies (SEC-10).
export async function getUserServerSupabase(): Promise<SupabaseClient> {
  const { url, anonKey } = requireEnv()
  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. Safe
          // to ignore: the session is refreshed on the next route handler request
          // and the current request still uses the fresh token.
        }
      },
    },
  })
}