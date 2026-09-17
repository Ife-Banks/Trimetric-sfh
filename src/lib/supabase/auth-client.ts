"use client"

// Cookie-backed browser auth client. The anonymous scan flow uses the plain
// anon client (localStorage session) — admin auth needs cookies so the server
// layout and route handlers can read the session. Keep the two separate.

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | null = null

export function getSupabaseAuthBrowser(): SupabaseClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      "Supabase auth client: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set"
    )
  }
  client = createBrowserClient(url, anonKey)
  return client
}