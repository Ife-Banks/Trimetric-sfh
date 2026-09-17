"use client"

// VerdictScreen — the SHARED seam (03_FRONTEND_ARCHITECTURE.md §3). Renders an
// EngineResult whether it came from gmoEngine, fluorideEngine (Phase 6), or a
// stored verified product row mapped into the same shape (FR-6). Adding a third
// category requires zero changes here. Required elements, in order:
// product identity → ResultBadge → ConfidenceBadge → guidance → matched terms
// → ConstraintNotice (never dismissible) → submission CTA/form.

import { useState } from "react"
import type { EngineResult } from "@/engines/types"
import type { IdentityMatch } from "@/lib/identification/productIdentification"
import { ResultBadge } from "./ResultBadge"
import { ConfidenceBadge } from "./ConfidenceBadge"
import { MatchedTermsList } from "./MatchedTermsList"
import { ConstraintNotice } from "./ConstraintNotice"
import { SubmissionForm, type SubmissionPrefill } from "./SubmissionForm"

export interface ProductIdentity {
  name: string
  brand?: string | null
  imageUrl?: string | null
  barcode?: string | null
  matchedBy: IdentityMatch
}

const MATCH_NOTE: Record<IdentityMatch, string> = {
  barcode: "Matched by barcode against the verified product dataset",
  name: "Matched by name against the verified product dataset",
  none: "Ingredients-only scan — no catalogue match",
}

export function VerdictScreen({
  result,
  identity,
  photo,
  ocrConfidence,
  ingredientsText,
}: {
  result: EngineResult
  identity: ProductIdentity
  photo?: { blob: Blob; url: string } | null
  ocrConfidence?: number
  ingredientsText?: string
}) {
  const [formOpen, setFormOpen] = useState(false)
  const lowConfidence = result.confidence.tier === "low"

  const prefill: SubmissionPrefill = {
    productName: identity.name,
    brand: identity.brand ?? "",
    ingredientsText: ingredientsText ?? "",
    barcode: identity.barcode,
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-4">
        {identity.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL from the camera; next/image can't optimize blob: URLs
          <img
            src={identity.imageUrl}
            alt={`Photo of ${identity.name}`}
            className="h-20 w-20 shrink-0 rounded-xl border border-zinc-200 object-cover dark:border-zinc-800"
          />
        ) : (
          <div className="h-20 w-20 shrink-0 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700" />
        )}
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{identity.name || "Unidentified product"}</h2>
          {identity.brand && <p className="text-sm text-zinc-500 dark:text-zinc-400">{identity.brand}</p>}
          {identity.barcode && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Barcode {identity.barcode}</p>
          )}
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{MATCH_NOTE[identity.matchedBy]}</p>
        </div>
      </header>

      {/* Result and Confidence as two SEPARATE badges, never merged (06_AGENT_CONTEXT §2.1). */}
      <div className="flex flex-wrap items-center gap-4">
        <ResultBadge tier={result.result.tier} label={result.result.label} />
        <ConfidenceBadge tier={result.confidence.tier} factors={result.confidence.factors} />
      </div>

      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{result.guidance}</p>

      <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          What was found
        </h3>
        <MatchedTermsList terms={result.matchedTerms} />
      </div>

      <ConstraintNotice notice={result.constraintNotice} />

      <div className="pt-1">
        {formOpen ? (
          <SubmissionForm
            result={result}
            prefill={prefill}
            photo={photo ?? null}
            ocrConfidence={ocrConfidence}
            onSuccess={() => setFormOpen(false)}
          />
        ) : lowConfidence ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="h-12 w-full rounded-full bg-zinc-900 text-base font-medium text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Verify this with a human — submit a correction
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="w-full rounded-full border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Something look wrong? Submit a correction
          </button>
        )}
      </div>
    </div>
  )
}