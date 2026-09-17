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
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label htmlFor="product-name" className="mb-1 block text-sm font-medium">
          Product name <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="product-name"
          name="product-name"
          value={draft.productName}
          onChange={(e) => setDraft((d) => ({ ...d, productName: e.target.value }))}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div>
        <label htmlFor="brand" className="mb-1 block text-sm font-medium">
          Brand
        </label>
        <input
          id="brand"
          name="brand"
          value={draft.brand}
          onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div>
        <label htmlFor="ingredients" className="mb-1 block text-sm font-medium">
          Ingredients text <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <textarea
          id="ingredients"
          name="ingredients"
          rows={6}
          value={draft.ingredientsText}
          onChange={(e) => setDraft((d) => ({ ...d, ingredientsText: e.target.value }))}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          This is the correction step — fix any OCR mistakes in what was extracted.
        </p>
      </div>

      <div>
        <label htmlFor="certification" className="mb-1 block text-sm font-medium">
          Certification visible on packaging
        </label>
        <select
          id="certification"
          name="certification"
          value={certification}
          onChange={(e) => setDraft((d) => ({ ...d, certificationText: e.target.value }))}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">None visible</option>
          {CERT_OPTIONS.map((cert) => (
            <option key={cert} value={cert}>
              {cert}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">
          Photo <span className="text-red-500" aria-hidden="true">*</span>
        </p>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL from the camera; next/image can't optimize blob: URLs
          <img
            src={photo.url}
            alt="Attached label photo to submit"
            className="h-36 w-full rounded-xl border border-zinc-200 object-cover dark:border-zinc-800"
          />
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No photo attached.</p>
        )}
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Re-encoded client-side (EXIF stripped) before upload.
        </p>
      </div>

      {error && (
        <p role="alert" aria-live="assertive" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="h-12 w-full rounded-full bg-zinc-900 text-base font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {submitting ? "Submitting…" : "Submit for review"}
      </button>
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
        Your correction goes to a human reviewer before it affects anyone&apos;s verdict.
      </p>
    </form>
  )
}