import { redirect } from "next/navigation"
import { getUserServerSupabase } from "@/lib/supabase/server"
import { AdminNav } from "@/components/admin/AdminNav"

// Server-side auth + role gate for the entire admin section (04 §1, 06 §5).
// profiles.role decides access — auth user metadata is never trusted (SEC-03).
// No session → the shared /login page with a return to /admin. Non-admins are
// redirected home. The
// same check repeats inside every /api/admin/* handler and (belt and braces)
// the database enforces it via RLS.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const supabase = await getUserServerSupabase()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect("/login?next=/admin")
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

  // `data-desktop-ok` opts this subtree out of the mobile-only gate
  // (globals.css). Reviewing a submission queue is a desk task; the rest of
  // the app is not.
  return (
    <div
      data-desktop-ok
      className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-6 md:px-6"
    >
      <div className="xl:grid xl:grid-cols-[14rem_minmax(0,1fr)] xl:gap-10">
        {/* Sidebar column: sticky on ≥xl, hidden below (AdminNav renders a
            horizontal bar with the same items for <xl via className). */}
        <aside className="hidden xl:block">
          <div className="sticky top-6">
            <AdminNav showManage={profile?.role === "superadmin"} />
          </div>
        </aside>

        <div className="min-w-0">
          <AdminNav showManage={profile?.role === "superadmin"} className="mb-6 xl:hidden" />
          {children}
        </div>
      </div>
    </div>
  )
}