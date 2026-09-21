import { redirect } from "next/navigation"
import { getUserServerSupabase } from "@/lib/supabase/server"
import { RegisterForm } from "@/components/auth/RegisterForm"

// Public register — the destination the onboarding carousel hands off to.
// Signing up is optional in this app (anonymous scanning needs no account), so
// an already-signed-in visitor has nothing to do here and goes straight on.
export const dynamic = "force-dynamic"

export default async function RegisterPage() {
  const supabase = await getUserServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect("/guest-dashboard")

  return <RegisterForm />
}
