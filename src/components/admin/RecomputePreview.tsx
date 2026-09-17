"use client"

// The recompute preview — what the rules engine would produce from the current
// (possibly corrected) ingredients text. The admin approves THIS, not typed-in
// values (02_SYSTEM_ARCHITECTURE.md §4.3).

import type { EngineResult } from "@/engines/types"
import { ResultBadge } from "@/components/verdict/ResultBadge"
import { ConfidenceBadge } from "@/components/verdict/ConfidenceBadge"
import { MatchedTermsList } from "@/components/verdict/MatchedTermsList"

export function RecomputePreview({ result }: { result: EngineResult | null }) {
  if (!result) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        No rules engine for this category yet (fluoride lands in Phase 6).
      </p>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Recomputed verdict (config v{result.configVersion})
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <ResultBadge tier={result.result.tier} label={result.result.label} />
        <ConfidenceBadge tier={result.confidence.tier} factors={result.confidence.factors} />
      </div>
      <MatchedTermsList terms={result.matchedTerms} />
    </div>
  )
}