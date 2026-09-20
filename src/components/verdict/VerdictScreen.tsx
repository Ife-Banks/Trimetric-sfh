"use client"

// VerdictScreen — the SHARED seam (03_FRONTEND_ARCHITECTURE.md §3). Renders an
// EngineResult whether it came from gmoEngine, fluorideEngine (Phase 6), or a
// stored verified product row mapped into the same shape (FR-6). Adding a third
// category requires zero changes here. Required elements, in order:
// product identity → ResultBadge → ConfidenceBadge → guidance → matched terms
// → ConstraintNotice (never dismissible) → submission CTA/form.

import { useState } from "react"
import { ImageIcon } from "lucide-react"
import type { EngineResult } from "@/engines/types"
import type { IdentityMatch } from "@/lib/identification/productIdentification"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/ui/panel"
import { InlineAlert } from "@/components/ui/inline-alert"
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
  const [submitted, setSubmitted] = useState(false)
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
            className="h-20 w-20 shrink-0 rounded-xl border object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed">
            <ImageIcon className="h-7 w-7 text-muted-foreground/60" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight">{identity.name || "Unidentified product"}</h2>
          {identity.brand && <p className="text-sm text-muted-foreground">{identity.brand}</p>}
          {identity.barcode && (
            <p className="text-xs text-muted-foreground">Barcode {identity.barcode}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">{MATCH_NOTE[identity.matchedBy]}</p>
        </div>
      </header>

      {/* Result and Confidence as two SEPARATE badges, never merged (06_AGENT_CONTEXT §2.1). */}
      <div className="flex flex-wrap items-center gap-4">
        <ResultBadge tier={result.result.tier} label={result.result.label} />
        <ConfidenceBadge tier={result.confidence.tier} factors={result.confidence.factors} />
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">{result.guidance}</p>

      <Panel variant="hairline">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          What was found
        </h3>
        <MatchedTermsList terms={result.matchedTerms} />
      </Panel>

      <ConstraintNotice notice={result.constraintNotice} />

      <div className="pt-1">
        {submitted ? (
          <InlineAlert variant="success">
            <p className="font-semibold">Correction submitted</p>
            <p className="mt-0.5">
              A reviewer will look at your correction. If it&apos;s approved it enters the verified
              dataset and future scans of this product get a high-confidence verdict.
            </p>
          </InlineAlert>
        ) : formOpen ? (
          <SubmissionForm
            result={result}
            prefill={prefill}
            photo={photo ?? null}
            ocrConfidence={ocrConfidence}
            onSuccess={() => {
              setSubmitted(true)
              setFormOpen(false)
            }}
          />
        ) : lowConfidence ? (
          <Button type="button" size="lg" className="w-full" onClick={() => setFormOpen(true)}>
            Verify this with a human — submit a correction
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => setFormOpen(true)}>
            Something look wrong? Submit a correction
          </Button>
        )}
      </div>
    </div>
  )
}