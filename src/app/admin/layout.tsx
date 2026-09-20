import { redirect } from "next/navigation"
import { getUserServerSupabase } from "@/lib/supabase/server"
import { AdminNav } from "@/components/admin/AdminNav"

// Server-side auth + role gate for the entire admin section (04 §1, 06 §5).
// profiles.role decides access — auth user metadata is never trusted (SEC-03).
// No session → the shared /auth/login page (Google for users, email/password
// for admins) with a return to /admin. Non-admins are redirected home. The
// same check repeats inside every /api/admin/* handler and (belt and braces)
// the database enforces it via RLS.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const supabase = await getUserServerSupabase()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect("/auth/login?next=/admin")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin"
  if (!isAdmin) {
    redirect("/")
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 pt-6 pb-12">
      <div className="px-4">
        <AdminNav showManage={profile?.role === "superadmin"} className="mb-6" />
      </div>
      {children}
    </div>
  )
}