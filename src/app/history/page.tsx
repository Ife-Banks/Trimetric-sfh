import Link from "next/link"
import { redirect } from "next/navigation"
import { getUserServerSupabase } from "@/lib/supabase/server"
import { SavedScansView } from "@/components/history/SavedScansView"
import { StatusBadge } from "@/components/ui/status-badge"
import { CategoryBadge } from "@/components/ui/category-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { InlineAlert } from "@/components/ui/inline-alert"
import { PageContainer, PageHeader } from "@/components/layout/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CalendarClock, CircleCheck, CircleX, History, ScanLine, Send } from "lucide-react"
import { Button } from "@/components/ui/button"

// Two tabs: "Verified" (scans the user chose to keep, client-side localStorage
// via lib/savedScans) and "Contributions" (corrections proposed after
// low-confidence scans — the server `submissions` table, RLS-gated to the
// owner). There is no shared scan-log table, so the two live apart.

export const dynamic = "force-dynamic"

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
}

const STATUS_STYLE: Record<string, "warning" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <CalendarClock />,
  approved: <CircleCheck />,
  rejected: <CircleX />,
}

interface HistoryRow {
  id: string
  product_name: string | null
  brand: string | null
  category: string
  status: string
  created_at: string
  reviewed_at: string | null
}

export default async function HistoryPage() {
  const supabase = await getUserServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/history")

  const { data, error } = await supabase
    .from("submissions")
    .select("id, product_name, brand, category, status, created_at, reviewed_at")
    .eq("submitted_by", user.id)
    .order("created_at", { ascending: false })

  const rows = (data ?? []) as HistoryRow[]

  return (
    // Capped at the app's 402pt column rather than PageContainer's `md`
    // measure (672px). Every other screen is 402 wide, and on the tablets this
    // app still supports (the gate stops at 1024) a 672px History read as a
    // different app to the 402px hub it was reached from.
    <PageContainer className="max-w-[402px]">
      <PageHeader
        title="History"
        description="Scans you kept and the corrections you've proposed."
      />

      <Tabs defaultValue="verified">
        {/* Underline tab bar — "Verified" (local history) | "Contributions"
            (server submissions, the honest label for what exists). */}
        <TabsList aria-label="History">
          <TabsTrigger value="verified">
            <History className="size-4" aria-hidden="true" />
            Verified
          </TabsTrigger>
          <TabsTrigger value="contributions">
            <Send className="size-4" aria-hidden="true" />
            Contributions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="verified" className="mt-6">
          <SavedScansView />
        </TabsContent>

        <TabsContent value="contributions" className="mt-6">
          {error ? (
            <InlineAlert variant="destructive">
              Could not load your submissions: {error.message}
            </InlineAlert>
          ) : rows.length === 0 ? (
            <div>
              <EmptyState
                icon={<Send className="size-5" aria-hidden="true" />}
                title="Nothing here yet"
                description="Low-confidence scans invite you to submit a correction and it shows up here."
                action={
                  <Button asChild size="sm">
                    <Link href="/scan">
                      <ScanLine className="size-4" aria-hidden="true" />
                      Start a scan
                    </Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li key={row.id} className="rounded-lg border border-border/80 bg-surface p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{row.product_name ?? "Unnamed product"}</span>
                    <CategoryBadge category={row.category as "gmo_food" | "oral_care"} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Submitted {new Date(row.created_at).toLocaleString()}</span>
                    <StatusBadge
                      variant={STATUS_STYLE[row.status] ?? "neutral"}
                      icon={STATUS_ICON[row.status]}
                    >
                      {STATUS_LABELS[row.status] ?? row.status}
                    </StatusBadge>
                    {row.reviewed_at && (
                      <span>Reviewed {new Date(row.reviewed_at).toLocaleString()}</span>
                    )}
                  </div>
                  {row.brand && (
                    <p className="mt-1 text-xs text-muted-foreground">{row.brand}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}