import { getUserServerSupabase } from "@/lib/supabase/server"
import { SettingsView } from "@/components/auth/SettingsView"
import { PageContainer, PageHeader } from "@/components/layout/page-header"

// Settings — account identity + sign-out (the bottom-tab destination).
// Anonymous scanning never needs an account; sign-in only unlocks the
// Submissions tab's per-user history.
export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const supabase = await getUserServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
    isAdmin = profile?.role === "admin" || profile?.role === "superadmin"
  }

  return (
    <PageContainer size="sm">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Your identity, sign-in, and reviewer access."
      />
      <SettingsView email={user?.email ?? null} isAdmin={isAdmin} />
    </PageContainer>
  )
}