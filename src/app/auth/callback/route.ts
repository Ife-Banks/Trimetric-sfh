import { NextResponse } from "next/server"
import { getUserServerSupabase } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/auth/nextPath"

// OAuth + PKCE callback. Google (and any future provider) redirects here with
// `?code=...`. We exchange the code for a session via the cookie-bound server
// client, which persists the session cookies for the rest of the app. `next`
// is carried through the redirectTo URL and sanitised before redirecting so an
// attacker-supplied value cannot send users off the app.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const next = safeNextPath(url.searchParams.get("next"))

  if (!code) {
    return NextResponse.redirect(new URL("/auth/login?error=callback_failed", request.url))
  }

  const supabase = await getUserServerSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL("/auth/login?error=callback_failed", request.url))
  }

  return NextResponse.redirect(new URL(next, request.url))
}