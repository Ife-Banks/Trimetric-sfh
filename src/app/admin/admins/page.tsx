import { redirect } from "next/navigation"
import { getUserServerSupabase } from "@/lib/supabase/server"
import { CreateAdminForm } from "@/components/admin/CreateAdminForm"
import { PageContainer, PageHeader } from "@/components/layout/page-header"

// Superadmin-only: provision reviewer accounts (email + password). The route
// guard plus the RLS-protected `profiles.role` check happen server-side here;
// the POST /api/admin/create handler repeats the same check before acting.
export const dynamic = "force-dynamic"

export default async function AdminUsersPage() {
  const supabase = await getUserServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login?next=/admin/admins")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "superadmin") redirect("/admin")

  return (
    <PageContainer size="sm" className="py-0">
      <PageHeader
        title="Reviewer accounts"
        description="Admins sign in with email + password. Normal users sign up themselves via Google — no account is created here for them."
      />
      <CreateAdminForm />
    </PageContainer>
  )
}