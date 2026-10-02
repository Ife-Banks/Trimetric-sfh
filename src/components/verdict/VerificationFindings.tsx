"use client"

// Confidence factors come directly from the deterministic engine. They explain
// the estimate; they are not checks that verify product contents.

import { useId } from "react"
import { CircleHelp } from "lucide-react"
import { Overline } from "@/components/ui/overline"

export function VerificationFindings({
  factors,
  title = "Confidence factors",
}: {
  factors: string[]
  title?: string
}) {
  const titleId = useId()
  if (!factors || factors.length === 0) return null

  return (
    <section aria-labelledby={titleId}>
      <Overline id={titleId}>{title}</Overline>
      <ul className="mt-2 space-y-2">
        {factors.map((factor, i) => (
          <li key={i} className="flex items-start gap-2.5 text-body">
            <CircleHelp className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>{factor}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
