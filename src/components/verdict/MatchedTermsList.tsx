// MatchedTermsList — what the engine actually found, grouped by kind so a
// certification and an ambiguous derivative can never be read as the same
// evidence class (03_FRONTEND_ARCHITECTURE.md §3, item 5). Each evidence
// class gets its own marker colour plus a count, and the empty case uses the
// app-wide EmptyState language (no terms found ≠ an absent engine).

import type { EngineTerm } from "@/engines/types"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { SearchX } from "lucide-react"
import { cn } from "cn"

const GROUP_ORDER: EngineTerm["kind"][] = ["certification", "explicit", "ambiguous", "active_compound"]

const GROUP_LABEL: Record<EngineTerm["kind"], string> = {
  certification: "Certification detected",
  explicit: "Crop-derived ingredients",
  ambiguous: "Ambiguous derivatives",
  active_compound: "Active compound",
}

const KIND_DOT: Record<EngineTerm["kind"], string> = {
  certification: "bg-success",
  explicit: "bg-primary",
  ambiguous: "bg-warning",
  active_compound: "bg-info",
}

function groupTerms(terms: EngineTerm[]): Map<EngineTerm["kind"], EngineTerm[]> {
  const groups = new Map<EngineTerm["kind"], EngineTerm[]>()
  for (const term of terms) {
    const list = groups.get(term.kind) ?? []
    list.push(term)
    groups.set(term.kind, list)
  }
  return groups
}

export function MatchedTermsList({ terms }: { terms: EngineTerm[] }) {
  const groups = groupTerms(terms)
  const present = GROUP_ORDER.filter((kind) => (groups.get(kind)?.length ?? 0) > 0)

  if (present.length === 0) {
    return (
      <EmptyState
        icon={<SearchX className="size-5" aria-hidden="true" />}
        title="No GMO-relevant terms recognised"
        description="Nothing in the ingredient list matched the lookup table. This can happen when the label text is damaged or the list is short."
        className="border-0 px-4 py-6"
      />
    )
  }

  return (
    <div className="space-y-4">
      {present.map((kind) => {
        const items = groups.get(kind) ?? []
        return (
          <div key={kind}>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className={cn("size-2 rounded-full", KIND_DOT[kind])} />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {GROUP_LABEL[kind]}
              </h3>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                {items.length}
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {items.map((term, i) => (
                <li key={`${term.term}-${i}`}>
                  <Badge
                    variant="secondary"
                    className="flex-wrap whitespace-normal rounded-lg px-2.5 py-1 text-sm font-normal"
                  >
                    <span className="font-medium capitalize">{term.term}</span>
                    {term.detail && (
                      <span className="ml-1.5 text-xs text-muted-foreground">· {term.detail}</span>
                    )}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}