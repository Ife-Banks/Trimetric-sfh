import Link from "next/link"
import { Camera, Database, Info, ScanLine } from "lucide-react"
import { DashboardHeader } from "@/components/layout/DashboardHeader"
import { Button } from "@/components/ui/button"
import { getUserServerSupabase } from "@/lib/supabase/server"

// Learn — the tab bar's fourth destination (Figma `bobby` 948:3154 "Learn").
// The mock has no frame for this screen, so it is built from the app's own
// explanation of what a check is: the things a first-time user needs to know
// before trusting a verdict. Copy is drawn from the engine specs
// (docs/GMO_Build_Guide.md, docs/Fluoride_Build_Guide.md) — nothing here claims
// more than the engines can actually support.
//
// It is the umbrella screen, not the GMO flow's: MUTAGENIC has two flows and
// this tab belongs to both, so the copy names both verdict languages (a GMO
// signal for food, a fluoride ppm reading for oral care). An earlier revision
// was headed "Reading a GMO Check result" and described only food, which read
// as if the fluoride half of the app did not exist.
export const dynamic = "force-dynamic"

const SECTIONS = [
  {
    icon: Camera,
    title: "How a check works",
    body: "Photograph the front and the ingredients panel. The app reads the label text, matches it against the catalogue and the rules engine, and returns one verdict with a separate confidence rating.",
  },
  {
    icon: Database,
    title: "What the result means",
    body: "For food, the verdict says how much GMO-linked signal the ingredient list carries. For oral care, it reads the listed fluoride compounds against the ppm range for that product type. Either way the rating is low, medium or high, and confidence says how much to trust it — a clear photo of a full ingredient list scores higher than a partial or blurry one.",
  },
  {
    icon: Info,
    title: "What it can't tell you",
    body: "A photograph cannot confirm whether a product contains GMO material, and a missing ingredient term is not proof of absence. Nor is a fluoride estimate a measurement — it is read off the label, not from the tube. Use a result as a prompt to read the label yourself, not as a laboratory answer or medical advice.",
  },
]

export default async function LearnPage() {
  const supabase = await getUserServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const fullName = user?.user_metadata?.full_name
  const displayName = typeof fullName === "string" ? fullName.trim() : ""

  return (
    <>
      {/* No back arrow: Learn is a tab-bar destination, so the bar is the way
          back and an arrow here duplicated it. */}
      <DashboardHeader
        title="Learn"
        profileName={displayName || "Guest User"}
        email={user?.email ?? null}
      />

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[402px] flex-1 px-5 pt-5 pb-6 outline-none"
      >
        <h1 className="text-[22px] font-bold leading-7 tracking-[-0.4px] text-primary">
          Reading a result
        </h1>
        <p className="mt-2 text-[14px] leading-5 text-gcheck-body">
          Three things worth knowing before you act on a GMO or fluoride verdict.
        </p>

        <div className="mt-5 space-y-4">
          {SECTIONS.map(({ icon: Icon, title, body }) => (
            <section key={title} className="rounded-md bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gcheck-tint text-gcheck-accent">
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
              </div>
              <p className="mt-2 text-[14px] leading-5 text-gcheck-body">{body}</p>
            </section>
          ))}
        </div>

        <div className="mt-6">
          <Button asChild className="h-12 w-full rounded-sm text-[14px] font-semibold">
            <Link href="/scan">
              <ScanLine className="size-4" aria-hidden="true" />
              Check a Product
            </Link>
          </Button>
        </div>
      </main>
    </>
  )
}
