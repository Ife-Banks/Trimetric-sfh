"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react"
import type { SubmissionForReview } from "@/lib/admin/recompute"
import { SubmissionRow } from "@/components/admin/SubmissionRow"
import { PageContainer, PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { cn } from "cn"

export type QueueCategory = "all" | SubmissionForReview["category"]

const FILTERS: { value: QueueCategory; label: string; domId: string }[] = [
  { value: "gmo_food", label: "Food (GMO)", domId: "food" },
  { value: "oral_care", label: "Oral care", domId: "oral" },
  { value: "all", label: "All", domId: "all" },
]

// Columns mirrored by SubmissionRow's md+ grid (minmax(0,1fr)_11rem_9rem_5rem_2rem).
const HEADER_CELLS = ["Product", "Category", "Submitted", "OCR", ""]

interface ReviewQueueProps {
  rows: SubmissionForReview[]
  total: number
  page: number
  pageSize: number
  category: QueueCategory
}

/** Windowed page numbers: always 1 & last, with up to five middles around the current page. */
function windowedPages(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const start = Math.max(2, current - 2)
  const end = Math.min(total - 1, start + 4)
  const pages: (number | "gap")[] = [1]
  if (start > 2) pages.push("gap")
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total - 1) pages.push("gap")
  pages.push(total)
  return pages
}

export function ReviewQueue({ rows, total, page, pageSize, category }: ReviewQueueProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const prevHref = `/admin?category=${category}&page=${Math.max(1, page - 1)}`
  const nextHref = `/admin?category=${category}&page=${Math.min(totalPages, page + 1)}`
  const pages = windowedPages(page, totalPages)

  return (
    <PageContainer size="lg" className="py-0">
      <PageHeader
        title="Review queue"
        description={`${total} pending submission${total === 1 ? "" : "s"}`}
        actions={
          <nav className="flex gap-1" aria-label="Filter by category">
            {FILTERS.map((filter) => (
              <Button
                key={filter.value}
                asChild
                variant={category === filter.value ? "default" : "outline"}
                size="sm"
                className="rounded-full"
              >
                <Link
                  href={`/admin?category=${filter.value}`}
                  aria-current={category === filter.value ? "page" : undefined}
                >
                  {filter.label}
                </Link>
              </Button>
            ))}
          </nav>
        }
      />

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Inbox className="size-5" aria-hidden="true" />}
            title="Queue cleared"
            description="No pending submissions in this category. New corrections appear here for review."
          />
        </div>
      ) : (
        <>
          {/* Table-style header row — md+ only; matches the row grid below. */}
          <div
            className="mt-6 hidden grid-cols-[minmax(0,1fr)_11rem_9rem_5rem_2rem] gap-4 border-b border-border px-5 pb-2 text-overline uppercase text-muted-foreground md:grid"
            aria-hidden="true"
          >
            {HEADER_CELLS.map((cell, i) => (
              <span key={i} className={cn(i === HEADER_CELLS.length - 1 && "justify-self-end")}>
                {cell}
              </span>
            ))}
          </div>
          <ul className="mt-2 space-y-2">
            {rows.map((row) => (
              <SubmissionRow key={row.id} submission={row} />
            ))}
          </ul>
        </>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <nav className="flex items-center gap-1" aria-label="Pagination">
            <Button
              asChild
              variant="outline"
              size="icon-sm"
              className={page <= 1 ? "pointer-events-none opacity-40" : ""}
              aria-disabled={page <= 1}
              aria-label="Previous page"
            >
              <Link href={prevHref}>
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            {pages.map((p, i) =>
              p === "gap" ? (
                <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground" aria-hidden="true">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  asChild
                  variant={p === page ? "default" : "ghost"}
                  size="icon-sm"
                  aria-current={p === page ? "page" : undefined}
                  aria-label={`Page ${p}`}
                >
                  <Link href={`/admin?category=${category}&page=${p}`}>{p}</Link>
                </Button>
              )
            )}
            <Button
              asChild
              variant="outline"
              size="icon-sm"
              className={page >= totalPages ? "pointer-events-none opacity-40" : ""}
              aria-disabled={page >= totalPages}
              aria-label="Next page"
            >
              <Link href={nextHref}>
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </nav>
        </div>
      )}
    </PageContainer>
  )
}