import { redirect } from "next/navigation"

// The sign-in screen moved to /login when the public entry screens were
// redesigned (onboarding → register/login). This stub stays behind so links
// minted before the move keep working — including any Supabase email template
// pointed at it from the dashboard, which is not something a migration can
// rename. `next` and `error` are carried across so the hop is invisible.
export default async function LegacyLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const params = new URLSearchParams()
  if (typeof sp.next === "string") params.set("next", sp.next)
  if (typeof sp.error === "string") params.set("error", sp.error)
  const query = params.toString()
  redirect(query ? `/login?${query}` : "/login")
}
