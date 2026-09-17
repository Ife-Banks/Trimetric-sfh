"use client"

import Link from "next/link"
import type { SubmissionForReview } from "@/lib/admin/recompute"
import { SubmissionRow } from "@/components/admin/SubmissionRow"

export type QueueCategory = "all" | SubmissionForReview["category"]

const FILTERS: { value: QueueCategory; label: string; domId: string }[] = [
  { value: "gmo_food", label: "Food (GMO)", domId: "food" },
  { value: "oral_care", label: "Oral care", domId: "oral" },
  { value: "all", label: "All", domId: "all" },
]

interface ReviewQueueProps {
  rows: SubmissionForReview[]
  total: number
  page: number
  pageSize: number
  category: QueueCategory
}

export function ReviewQueue({ rows, total, page, pageSize, category }: ReviewQueueProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const prevHref = `/admin?category=${category}&page=${Math.max(1, page - 1)}`
  const nextHref = `/admin?category=${category}&page=${Math.min(totalPages, page + 1)}`

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Review queue</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{total} pending submission{total === 1 ? "" : "s"}</p>
        </div>
        <nav className="flex gap-2" aria-label="Filter by category">
          {FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={`/admin?category=${filter.value}`}
              aria-current={category === filter.value ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${
                category === filter.value
                  ? "border-zinc-900 bg-zinc-900 text-zinc-50 dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                  : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              }`}
            >
              {filter.label}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No pending submissions in this category.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((row) => (
            <SubmissionRow key={row.id} submission={row} />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
          <Link
            href={prevHref}
            aria-disabled={page <= 1}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              page <= 1
                ? "pointer-events-none border-zinc-200 text-zinc-300 dark:border-zinc-800 dark:text-zinc-600"
                : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            Previous
          </Link>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Page {page} of {totalPages}
          </span>
          <Link
            href={nextHref}
            aria-disabled={page >= totalPages}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              page >= totalPages
                ? "pointer-events-none border-zinc-200 text-zinc-300 dark:border-zinc-800 dark:text-zinc-600"
                : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            Next
          </Link>
        </nav>
      )}
    </main>
  )
}