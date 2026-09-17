import { getUserServerSupabase } from "@/lib/supabase/server"
import type { SubmissionForReview } from "@/lib/admin/recompute"
import { ReviewQueue, type QueueCategory } from "@/components/admin/ReviewQueue"

// Admin data is request-time and must never be cached or prerendered.
export const dynamic = "force-dynamic"

const PAGE_SIZE = 25
const CATEGORIES: QueueCategory[] = ["all", "gmo_food", "oral_care"]

function parseCategory(value: string | string[] | undefined): QueueCategory {
  const first = Array.isArray(value) ? value[0] : value
  return CATEGORIES.includes(first as QueueCategory) ? (first as QueueCategory) : "all"
}

function parsePage(value: string | string[] | undefined): number {
  const first = Array.isArray(value) ? value[0] : value
  const parsed = Number.parseInt(first ?? "1", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const params = await searchParams
  const category = parseCategory(params.category)
  const page = parsePage(params.page)

  const supabase = await getUserServerSupabase()
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from("submissions")
    .select("*", { count: "exact" })
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .range(from, to)

  if (category !== "all") {
    query = query.eq("category", category)
  }

  const { data, count, error } = await query

  if (error) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300">
          Could not load the queue: {error.message}
        </p>
      </main>
    )
  }

  const rows = (data ?? []) as SubmissionForReview[]
  return (
    <ReviewQueue rows={rows} total={count ?? 0} page={page} pageSize={PAGE_SIZE} category={category} />
  )
}