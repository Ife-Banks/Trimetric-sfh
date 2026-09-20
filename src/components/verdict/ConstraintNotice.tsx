// ConstraintNotice — the honesty statement. ALWAYS rendered on every GMO
// verdict and NEVER dismissible (06_AGENT_CONTEXT.md §2.2, 01_TECHNICAL_SPEC
// FR-1). There is deliberately no close button: the constraint is not optional
// UI that users can shrug away.

import { Info } from "lucide-react"

export function ConstraintNotice({ notice }: { notice: string }) {
  return (
    <aside
      role="note"
      aria-label="Constraint notice"
      className="flex items-start gap-3 rounded-xl border bg-muted px-4 py-3 text-sm text-muted-foreground"
    >
      <Info className="mt-0.5 size-4 shrink-0 opacity-60" aria-hidden="true" />
      <p>{notice}</p>
    </aside>
  )
}