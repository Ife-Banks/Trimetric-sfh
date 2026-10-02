import type { Metadata } from "next"
import { DashboardHeader } from "@/components/layout/DashboardHeader"
import { HubGreeting } from "@/components/hub/HubGreeting"
import { ShieldStreakCard } from "@/components/hub/ShieldStreakCard"
import { CategoryCard } from "@/components/hub/CategoryCard"
import { TrustMetricsBar } from "@/components/dashboard/TrustMetricsBar"
import { RecentChecks } from "@/components/dashboard/RecentChecks"
import { getCatalogueStats } from "@/lib/api/catalogueStats"
import { FEED_LIMIT, loadAccountScans, loadScanActivity } from "@/lib/scanFeed"
import { getUserServerSupabase } from "@/lib/supabase/server"

// The hub — the app's home, and where its two halves meet (Figma `Untitled`,
// frame 1:1233).
//
// This is the screen "Continue as Guest", sign-in and post-signup all land on.
// It exists because they used to land on /guest-dashboard while that WAS the GMO
// dashboard, so an anonymous user choosing to skip signup was silently put into
// the food flow and never saw that oral care existed at all. Choosing a category
// is the hub's whole job, so nothing here assumes one.
//
// MUTAGENIC is the umbrella; "GMO Check" and "Fluoride Scan" are its two flows.
// The GMO card opens that flow's own home (/gmo, the designed screen 1); the
// fluoride card goes straight into a fluoride scan, because there is no fluoride
// home screen designed yet.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "MUTAGENIC — Scan, read, decide",
}

export default async function HubPage() {
  const supabase = await getUserServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const fullName = user?.user_metadata?.full_name
  const displayName = typeof fullName === "string" ? fullName.trim() : ""

  const [stats, activity, accountFeed] = await Promise.all([
    getCatalogueStats(supabase),
    // Only a signed-in user has rows in `scans`; RLS scopes them to the caller.
    // Returning null (rather than zeroes) is what lets the shield card fall back
    // to the on-device store instead of claiming a guest has never scanned.
    user ? loadScanActivity(supabase) : Promise.resolve(null),
    user ? loadAccountScans(supabase, FEED_LIMIT) : Promise.resolve(null),
  ])

  return (
    <>
      <DashboardHeader profileName={displayName || "Guest User"} email={user?.email ?? null} />

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[402px] flex-1 px-5 pt-5 pb-6 outline-none"
      >
        <h1 className="sr-only">Home</h1>

        <HubGreeting displayName={displayName} isMember={Boolean(user)} />

        <div className="mt-4 space-y-4">
          <ShieldStreakCard accountActivity={activity} />
          <CategoryCard category="gmo" />
          <CategoryCard category="oral_care" />
          <TrustMetricsBar stats={stats} />
          <RecentChecks accountFeed={accountFeed} />
        </div>
      </main>
    </>
  )
}
