"use client"

import Link from "next/link"
import { Inbox } from "lucide-react"
import type { SubmissionForReview } from "@/lib/admin/recompute"
import { SubmissionRow } from "@/components/admin/SubmissionRow"
import { PageContainer, PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"

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
        <ul className="mt-6 space-y-3">
          {rows.map((row) => (
            <SubmissionRow key={row.id} submission={row} />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
          <Button
            asChild
            variant="outline"
            size="sm"
            className={page <= 1 ? "pointer-events-none opacity-50" : ""}
            aria-disabled={page <= 1}
          >
            <Link href={prevHref}>Previous</Link>
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            asChild
            variant="outline"
            size="sm"
            className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
            aria-disabled={page >= totalPages}
          >
            <Link href={nextHref}>Next</Link>
          </Button>
        </nav>
      )}
    </PageContainer>
  )
}