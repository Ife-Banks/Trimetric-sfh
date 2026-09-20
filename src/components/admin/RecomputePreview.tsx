"use client"

// The recompute preview — what the rules engine would produce from the current
// (possibly corrected) ingredients text. The admin approves THIS, not typed-in
// values (02_SYSTEM_ARCHITECTURE.md §4.3).

import type { EngineResult } from "@/engines/types"
import { ResultBadge } from "@/components/verdict/ResultBadge"
import { ConfidenceBadge } from "@/components/verdict/ConfidenceBadge"
import { MatchedTermsList } from "@/components/verdict/MatchedTermsList"
import { Panel } from "@/components/ui/panel"

export function RecomputePreview({ result }: { result: EngineResult | null }) {
  if (!result) {
    return (
      <Panel variant="hairline" className="border-dashed text-sm text-muted-foreground">
        No rules engine for this category yet (fluoride lands in Phase 6).
      </Panel>
    )
  }

  return (
    <Panel variant="inset" className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Recomputed verdict (config v{result.configVersion})
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <ResultBadge tier={result.result.tier} label={result.result.label} />
        <ConfidenceBadge tier={result.confidence.tier} factors={result.confidence.factors} />
      </div>
      <MatchedTermsList terms={result.matchedTerms} />
    </Panel>
  )
}