"use client"

// SubmissionForm — the low-confidence contribution loop (GMO_Build_Guide.md §9,
// 03_FRONTEND_ARCHITECTURE.md §3). Every field pre-fills from what the engine
// extracted; the user is correcting, not authoring. Photo is auto-attached from
// the capture step (never re-asked). Canvas re-encode strips EXIF before the
// upload; the row lands via /api/submissions (Zod + rate limit + RLS).

import { useEffect, useMemo, useRef, useState } from "react"
import config from "../../../data/gmo_lookup_config_v1.0.json"
import type { EngineResult } from "@/engines/types"
import { getSupabaseBrowser } from "@/lib/supabase/client"
import {
  coarseClientFingerprint,
  encodeUploadImage,
  uploadSubmissionImage,
} from "@/lib/upload/uploadImage"
import type { SubmissionPayload } from "@/lib/validation/schemas"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { InlineAlert } from "@/components/ui/inline-alert"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Radix Select items can't carry an empty-string value; "none" maps to "".
const CERT_NONE = "none"

export interface SubmissionPrefill {
  productName: string
  brand: string
  ingredientsText: string
  barcode?: string | null
}

const DRAFT_KEY = "shf:submission-draft"

const CERT_OPTIONS: string[] = config.certification_short_circuit.terms

interface Draft {
  productName: string
  brand: string
  ingredientsText: string
  certificationText: string
}

function emptyDraft(prefill: SubmissionPrefill, cert: string): Draft {
  return {
    productName: prefill.productName,
    brand: prefill.brand,
    ingredientsText: prefill.ingredientsText,
    certificationText: cert,
  }
}

function loadDraft(prefill: SubmissionPrefill, cert: string): Draft {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return emptyDraft(prefill, cert)
    const parsed = JSON.parse(raw) as Partial<Draft>
    return emptyDraft(
      {
        productName: typeof parsed.productName === "string" && parsed.productName ? parsed.productName : prefill.productName,
        brand: typeof parsed.brand === "string" ? parsed.brand : prefill.brand,
        ingredientsText: typeof parsed.ingredientsText === "string" && parsed.ingredientsText ? parsed.ingredientsText : prefill.ingredientsText,
        barcode: prefill.barcode,
      },
      typeof parsed.certificationText === "string" ? parsed.certificationText : cert
    )
  } catch {
    return emptyDraft(prefill, cert)
  }
}

export function SubmissionForm({
  result,
  prefill,
  photo,
  ocrConfidence,
  onSuccess,
}: {
  result: EngineResult
  prefill: SubmissionPrefill
  photo: { blob: Blob; url: string } | null
  ocrConfidence?: number
  onSuccess: () => void
}) {
  const fingerprint = useMemo(() => coarseClientFingerprint(), [])
  const matchedCert = result.matchedTerms.find((t) => t.kind === "certification")?.term ?? ""

  const [draft, setDraft] = useState<Draft>(() => loadDraft(prefill, matchedCert))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const firstInit = useRef(false)

  // Persist the draft so a failed upload doesn't lose the user's typing.
  useEffect(() => {
    if (!firstInit.current) {
      firstInit.current = true
      return
    }
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [draft])

  useEffect(() => () => window.sessionStorage.removeItem(DRAFT_KEY), [])

  const certification = draft.certificationText

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const productName = draft.productName.trim()
    const ingredientsText = draft.ingredientsText.trim()
    if (!productName) {
      setError("Product name is required.")
      return
    }
    if (!ingredientsText) {
      setError("Ingredients text is required.")
      return
    }
    if (!photo) {
      setError("A photo is required. Please retake the label photo.")
      return
    }

    setSubmitting(true)
    try {
      const supabase = getSupabaseBrowser()
      const jpeg = await encodeUploadImage(photo.blob)
      const { path: photoPath } = await uploadSubmissionImage(supabase, jpeg)

      const payload: SubmissionPayload = {
        category: result.category,
        subcategory: result.subcategory,
        productName,
        brand: draft.brand.trim(),
        barcode: prefill.barcode ?? "",
        ingredientsText,
        certificationText: certification,
        concentrationText: "",
        photoPath,
        ocrConfidence: ocrConfidence ?? null,
        enginePreview: result as unknown as Record<string, unknown>,
        fingerprint,
      }

      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string; issues?: { message: string }[] } | null
        const message = data?.message ?? data?.issues?.[0]?.message ?? `Submission failed (HTTP ${res.status}).`
        throw new Error(message)
      }

      window.sessionStorage.removeItem(DRAFT_KEY)
      toast.success("Correction submitted", {
        description: "A reviewer will check it shortly. It's now in your history.",
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <Field label="Product name" htmlFor="product-name" required>
        <Input
          id="product-name"
          name="product-name"
          value={draft.productName}
          onChange={(e) => setDraft((d) => ({ ...d, productName: e.target.value }))}
        />
      </Field>

      <Field label="Brand" htmlFor="brand">
        <Input
          id="brand"
          name="brand"
          value={draft.brand}
          onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
        />
      </Field>

      <Field
        label="Ingredients text"
        htmlFor="ingredients"
        required
        helper="This is the correction step — fix any OCR mistakes in what was extracted."
      >
        <Textarea
          id="ingredients"
          name="ingredients"
          rows={6}
          className="font-mono"
          value={draft.ingredientsText}
          onChange={(e) => setDraft((d) => ({ ...d, ingredientsText: e.target.value }))}
        />
      </Field>

      <Field label="Certification visible on packaging" htmlFor="certification" noClone>
        <Select
          value={certification || CERT_NONE}
          onValueChange={(v) =>
            setDraft((d) => ({ ...d, certificationText: v === CERT_NONE ? "" : v }))
          }
        >
          <SelectTrigger id="certification" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CERT_NONE}>None visible</SelectItem>
            {CERT_OPTIONS.map((cert) => (
              <SelectItem key={cert} value={cert}>
                {cert}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">
          Photo{" "}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </p>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL from the camera; next/image can't optimize blob: URLs
          <img
            src={photo.url}
            alt="Attached label photo to submit"
            className="h-36 w-full rounded-xl border object-cover"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No photo attached.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Re-encoded client-side (EXIF stripped) before upload.
        </p>
      </div>

      {error && (
        <InlineAlert variant="destructive">
          <p aria-live="assertive">{error}</p>
        </InlineAlert>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Spinner /> Submitting…
          </>
        ) : (
          "Submit for review"
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground" aria-live="polite">
        Your correction goes to a human reviewer before it affects anyone&apos;s verdict.
      </p>
    </form>
  )
}