"use client"

// AddProductScreen — the "Help us add" contribution screen (Figma 51:384).
// Wraps the existing SubmissionForm: header + short call-to-copy + the form.
// Every field pre-fills from the scan; the receipt reference is derived from
// the uploaded photo path and handed to onDone when the row lands.

import { CheckCircle2, ChevronLeft } from "lucide-react"
import type { EngineResult } from "@/engines/types"
import type { LookupConfig } from "@/lib/config/lookupConfig"
import {
  SubmissionForm,
  type SubmissionPrefill,
} from "@/components/verdict/SubmissionForm"
import { Button } from "@/components/ui/button"
import { Overline } from "@/components/ui/overline"

export function AddProductScreen({
  result,
  lookupConfig,
  prefill,
  photo,
  frontPhoto,
  ocrConfidence,
  onBack,
  onDone,
}: {
  result: EngineResult
  lookupConfig: LookupConfig
  prefill: SubmissionPrefill
  photo: { blob: Blob; url: string } | null
  frontPhoto: { blob: Blob; url: string } | null
  ocrConfidence?: number
  onBack: () => void
  onDone: (reference: string, product: { productName: string; brand: string }) => void
}) {
  return (
    <div className="space-y-4">
      <header className="flex h-10 items-center gap-2 border-b border-border/70">
        <Button type="button" variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Button>
        <h1 className="flex-1 text-label font-semibold">Product Details</h1>
      </header>

      <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-caption font-medium text-success">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
        Community database contribution
      </div>

      <div className="space-y-1">
        <Overline>Contribute</Overline>
        <h2 className="text-h2 font-bold tracking-tight">Help us add this product</h2>
        <p className="text-caption leading-relaxed text-muted-foreground">
          Review the scanned label details and correct anything OCR misread. Submissions are reviewed before they can enter the product catalogue.
        </p>
      </div>

      <div className={`rounded-lg border p-3 text-caption leading-relaxed ${result.category === "gmo_food" ? "border-success/20 bg-accent-gmo-soft" : "border-info/20 bg-accent-fluoride-soft"}`}>
        Product information helps improve the catalogue. It does not certify a product or prove its contents.
      </div>

      <SubmissionForm
        result={result}
        lookupConfig={lookupConfig}
        prefill={prefill}
        photo={photo}
        frontPhoto={frontPhoto}
        ocrConfidence={ocrConfidence}
        onSuccess={onDone}
      />
    </div>
  )
}
