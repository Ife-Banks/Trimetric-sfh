import { DashboardHeader } from "@/components/layout/DashboardHeader"
import { BrandHeroCard } from "@/components/dashboard/BrandHeroCard"
import { TrustMetricsBar } from "@/components/dashboard/TrustMetricsBar"
import { LookupBar } from "@/components/dashboard/LookupBar"
import { LookupResults } from "@/components/dashboard/LookupResults"
import { RecentChecks } from "@/components/dashboard/RecentChecks"
import { getCatalogueStats } from "@/lib/api/catalogueStats"
import { MIN_LOOKUP_LENGTH, searchCatalogue } from "@/lib/api/catalogueSearch"
import { FEED_LIMIT, loadAccountScans } from "@/lib/scanFeed"
import { getUserServerSupabase } from "@/lib/supabase/server"

// GMO Check — the food flow's own home (Figma `bobby`, frame 948:3040).
//
// This was /guest-dashboard until the hub took that slot. It moves because the
// hub is the app's front door and this screen is one of two flows behind it;
// having the guest path land here was the bug.
//
// Nothing on this screen is hardcoded. The metrics are counted from the
// catalogue and the published rulesets, the lookup is the real catalogue search,
// and the feed is the user's own scan history (falling back to the on-device
// store for guests, who have no account to scope rows to).
export const dynamic = "force-dynamic"

export default async function GmoHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawQuery = params.q
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : (rawQuery ?? "")).trim()
  const searching = query.length >= MIN_LOOKUP_LENGTH

  const supabase = await getUserServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const fullName = user?.user_metadata?.full_name
  const displayName = typeof fullName === "string" ? fullName.trim() : ""

  const [stats, matches, accountFeed] = await Promise.all([
    getCatalogueStats(supabase),
    searching ? searchCatalogue(supabase, query) : Promise.resolve(null),
    user ? loadAccountScans(supabase, FEED_LIMIT) : Promise.resolve(null),
  ])

  return (
    <>
      <DashboardHeader
        title="GMO Check"
        showBack
        profileName={displayName || "Guest User"}
        email={user?.email ?? null}
      />

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[402px] flex-1 px-5 pt-5 pb-6 outline-none"
      >
        <h1 className="sr-only">GMO Check</h1>

        {/* Hidden while a lookup is active so the matches land near the top.
            Submitting the search form navigates, which resets scroll to the
            top — leaving the 400pt hero in place would push the answer the user
            just asked for below the fold. */}
        {!searching && <BrandHeroCard scanHref="/scan?category=gmo" />}

        <div className={searching ? "space-y-4" : "mt-8 space-y-4"}>
          <TrustMetricsBar stats={stats} />
          <LookupBar actionPath="/gmo" initialQuery={query} />
          {matches && <LookupResults query={query} matches={matches} />}
          <RecentChecks accountFeed={accountFeed} />
        </div>
      </main>
    </>
  )
}
