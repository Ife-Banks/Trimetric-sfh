"use client"

// VerificationFindings — the "Verified Criteria" checklist (UI_UX_Redesign_Prompt
// "Non-negotiable structural fix", 08_DESIGN_SYSTEM.md §3). Driven by
// `confidence.factors` — the REAL engine output, never hardcoded. Each factor is
// a verified fact that contributed to the confidence tier; rendered as a checked
// item (status = verified) with the factor text as the supporting detail.
// Renders nothing — not an empty card — when there are no factors.

import { useId } from "react"
import { CircleCheck } from "lucide-react"
import { Overline } from "@/components/ui/overline"

export function VerificationFindings({ factors }: { factors: string[] }) {
  const titleId = useId()
  if (!factors || factors.length === 0) return null

  return (
    <section aria-labelledby={titleId}>
      <Overline id={titleId}>Verification findings</Overline>
      <ul className="mt-2 space-y-2">
        {factors.map((factor, i) => (
          <li key={i} className="flex items-start gap-2.5 text-body">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <span>{factor}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}