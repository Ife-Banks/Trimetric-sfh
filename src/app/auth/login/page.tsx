import { redirect } from "next/navigation"
import { getUserServerSupabase } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/auth/nextPath"
import { SignInForm } from "@/components/auth/SignInForm"

// Shared sign-in page: normal users enter via Google (they have no password —
// admin accounts are provisioned by a superadmin), admins use email + password.
// A signed-in user is bounced straight to their destination instead of seeing
// the form again.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : "/")
  const error = typeof sp.error === "string" ? sp.error : null

  const supabase = await getUserServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const wantsAdmin = next === "/admin" || next.startsWith("/admin/")
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
    const isAdmin = profile?.role === "admin" || profile?.role === "superadmin"
    if (wantsAdmin && !isAdmin) redirect("/")
    redirect(next)
  }

  return <SignInForm next={next} error={error} />
}