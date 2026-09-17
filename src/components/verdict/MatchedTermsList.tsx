// MatchedTermsList — what the engine actually found, grouped by kind so a
// certification and an ambiguous derivative can never be read as the same
// evidence class (03_FRONTEND_ARCHITECTURE.md §3, item 5).

import type { EngineTerm } from "@/engines/types"

const GROUP_ORDER: EngineTerm["kind"][] = ["certification", "explicit", "ambiguous", "active_compound"]

const GROUP_LABEL: Record<EngineTerm["kind"], string> = {
  certification: "Certification detected",
  explicit: "Crop-derived ingredients",
  ambiguous: "Ambiguous derivatives",
  active_compound: "Active compound",
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
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No GMO-relevant terms were recognised in the ingredient list.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {present.map((kind) => (
        <div key={kind}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {GROUP_LABEL[kind]}
          </h3>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {(groups.get(kind) ?? []).map((term, i) => (
              <li
                key={`${term.term}-${i}`}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
              >
                <span className="font-medium capitalize">{term.term}</span>
                {term.detail && (
                  <span className="ml-1.5 text-xs text-zinc-500 dark:text-zinc-400">· {term.detail}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}