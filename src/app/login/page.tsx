import { redirect } from "next/navigation"
import { getUserServerSupabase } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/auth/nextPath"
import { LoginForm } from "@/components/auth/LoginForm"

// Public login. Carries the two pieces of state /admin, /admin/admins, /history
// and /auth/callback hand over: a `next` to return to after sign-in, and a short
// `error` code. `next` is filtered through safeNextPath() before it is used or
// passed down, so this page can never be turned into an open redirect.
export const dynamic = "force-dynamic"

const HUB_PATH = "/guest-dashboard"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const rawNext = typeof sp.next === "string" ? sp.next : null
  // Default straight to the hub rather than "/" — "/" is the onboarding
  // carousel now, and a returning member should not be walked through it again.
  const next = rawNext ? safeNextPath(rawNext) : HUB_PATH
  const error = typeof sp.error === "string" ? sp.error : null

  const supabase = await getUserServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    // Already signed in — a stale link, or a second tab. Send them on to where
    // they were heading, but only an admin may be sent into /admin. The role is
    // read from `profiles`, never from auth user metadata (SEC-03); the /admin
    // layout repeats this check, and RLS enforces it at the database.
    const wantsAdmin = next === "/admin" || next.startsWith("/admin/")
    if (wantsAdmin) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
      const isAdmin = profile?.role === "admin" || profile?.role === "superadmin"
      if (!isAdmin) redirect("/")
    }
    redirect(next)
  }

  return <LoginForm next={next} error={error} />
}
