import { redirect } from "next/navigation"
import { getUserServerSupabase } from "@/lib/supabase/server"
import { AdminLogin } from "@/components/admin/AdminLogin"

// Server-side auth + role gate for the entire admin section (04 §1, 06 §5).
// profiles.role decides access — auth user metadata is never trusted (SEC-03).
// Without a session we render the login form; with a session that is not an
// admin we redirect away. The same check repeats inside every /api/admin/*
// handler and (belt and braces) the database enforces it via RLS.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const supabase = await getUserServerSupabase()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return <AdminLogin />
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "admin") {
    redirect("/")
  }

  return <>{children}</>
}