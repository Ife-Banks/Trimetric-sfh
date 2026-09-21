"use client"

// VerdictScreen — the SHARED seam (03_FRONTEND_ARCHITECTURE.md §3). Renders an
// EngineResult whether it came from gmoEngine, fluorideEngine (Phase 6), or a
// stored verified product row mapped into the same shape. Canonical order
// (UI_UX_Redesign_Prompt §"Non-negotiable structural fix"): identity header →
// result summary (ResultBadge) → result gauge (ResultGauge, real value only) →
// ConfidenceBadge (separate chip, never merged) → guidance → product
// information → matched terms → verification findings (confidence.factors) →
// ConstraintNotice (never dismissible) → submission CTA/form.

import { useState } from "react"
import { ImageIcon } from "lucide-react"
import type { EngineResult } from "@/engines/types"
import type { IdentityMatch } from "@/lib/identification/productIdentification"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/ui/panel"
import { Overline } from "@/components/ui/overline"
import { InlineAlert } from "@/components/ui/inline-alert"
import { CategoryBadge } from "@/components/ui/category-badge"
import { ResultBadge } from "./ResultBadge"
import { ConfidenceBadge } from "./ConfidenceBadge"
import { ResultGauge } from "./ResultGauge"
import { gaugeValue } from "./gaugeValue"
import { MatchedTermsList } from "./MatchedTermsList"
import { ConstraintNotice } from "./ConstraintNotice"
import { VerificationFindings } from "./VerificationFindings"
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
    <div className="space-y-6">
      {/* Header — product identity + screen eyebrow */}
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
          <Overline>Diagnostic result</Overline>
          <h2 className="mt-1 truncate text-h2 font-semibold tracking-tight">
            {identity.name || "Unidentified product"}
          </h2>
          {identity.brand && <p className="text-sm text-muted-foreground">{identity.brand}</p>}
        </div>
      </header>

      {/* Result cluster — summary (pill) → gauge → confidence. The gauge shows
          the RESULT only (tier + real value); confidence is a separate chip of
          a different shape, never merged (08 §2, 06_AGENT_CONTEXT §2). */}
      <section aria-label="Result" className="flex flex-col items-center gap-5 py-2">
        <ResultBadge tier={result.result.tier} label={result.result.label} />
        <ResultGauge tier={result.result.tier} value={gaugeValue(result, ingredientsText)} />
        <ConfidenceBadge tier={result.confidence.tier} factors={result.confidence.factors} />
      </section>

      <p className="text-body leading-relaxed text-muted-foreground">{result.guidance}</p>

      <Panel variant="hairline" padding="md">
        <Overline>Product information</Overline>
        <dl className="mt-3 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Category</dt>
            <dd>
              <CategoryBadge category={result.category} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Barcode</dt>
            <dd className="text-right tabular-nums">{identity.barcode || "No barcode"}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="pt-px text-muted-foreground">Identified as</dt>
            <dd className="text-right">{MATCH_NOTE[identity.matchedBy]}</dd>
          </div>
        </dl>
      </Panel>

      <Panel variant="hairline" padding="md">
        <Overline>What was found</Overline>
        <div className="mt-3">
          <MatchedTermsList terms={result.matchedTerms} />
        </div>
      </Panel>

      <VerificationFindings factors={result.confidence.factors} />

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
          <Button type="button" variant="outline" className="w-full" onClick={() => setFormOpen(true)}>
            Something look wrong? Submit a correction
          </Button>
        )}
      </div>
    </div>
  )
}