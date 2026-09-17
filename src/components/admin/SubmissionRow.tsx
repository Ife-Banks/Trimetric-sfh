"use client"

// One pending submission, expandable. Expansion fetches a short-lived signed
// URL for the photo (never a public URL — 04 §6, SEC-05), lets the admin
// correct the ingredients text / certification, shows a live rules-engine
// recompute of THOSE corrected values, and approves/rejects. Approve posts the
// recomputed EngineResult to approve_submission() — the verdict is never typed.

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import config from "../../../data/gmo_lookup_config_v1.0.json"
import type { SubmissionForReview } from "@/lib/admin/recompute"
import { composeScoringText, recomputeVerdict } from "@/lib/admin/recompute"
import { RecomputePreview } from "@/components/admin/RecomputePreview"
import { ConstraintNotice } from "@/components/verdict/ConstraintNotice"
import { GMO_CONSTRAINT_NOTICE } from "@/engines/gmoEngine"

const CERT_OPTIONS: string[] = config.certification_short_circuit.terms

const CATEGORY_LABEL: Record<SubmissionForReview["category"], string> = {
  gmo_food: "Food (GMO)",
  oral_care: "Oral care (fluoride)",
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export function SubmissionRow({ submission }: { submission: SubmissionForReview }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [ingredients, setIngredients] = useState(submission.ingredients_text)
  const [certification, setCertification] = useState(submission.certification_text ?? "")
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const result = useMemo(
    () => recomputeVerdict(ingredients, certification, submission),
    [ingredients, certification, submission]
  )
  const scoringText = composeScoringText(ingredients, certification)

  async function fetchPhoto() {
    if (photoUrl || photoError || !submission.photo_path) return
    try {
      const res = await fetch(`/api/admin/photo?path=${encodeURIComponent(submission.photo_path)}`)
      if (!res.ok) throw new Error(`Photo request failed (${res.status})`)
      const body = (await res.json()) as { url: string }
      setPhotoUrl(body.url)
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Could not load photo")
    }
  }

  async function onToggle() {
    const next = !open
    setOpen(next)
    if (next) void fetchPhoto()
  }

  async function approve() {
    if (!result) return
    setBusy("approve")
    setActionError(null)
    const finalPayload = {
      barcode: submission.barcode ?? "",
      name: submission.product_name,
      brand: submission.brand ?? "",
      category: submission.category,
      subcategory: submission.subcategory ?? "",
      ingredients_text: scoringText,
      result_tier: result.result.tier,
      result_label: result.result.label,
      confidence_tier: result.confidence.tier,
      matched_terms: result.matchedTerms,
      guidance_text: result.guidance,
      config_version: result.configVersion,
    }
    try {
      const res = await fetch("/api/admin/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: submission.id, finalPayload }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { message?: string; error?: string }
        throw new Error(body.message ?? body.error ?? `Approve failed (${res.status})`)
      }
      router.refresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Approve failed")
      setBusy(null)
    }
  }

  async function reject() {
    setBusy("reject")
    setActionError(null)
    try {
      const res = await fetch("/api/admin/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: submission.id }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? `Reject failed (${res.status})`)
      }
      router.refresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Reject failed")
      setBusy(null)
    }
  }

  return (
    <li className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => void onToggle()}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{submission.product_name}</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            {submission.brand || "Unbranded"} · {CATEGORY_LABEL[submission.category]} ·{" "}
            {formatDate(submission.created_at)}
          </span>
        </span>
        <span className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            OC {submission.ocr_confidence != null ? `${submission.ocr_confidence.toFixed(0)}%` : "—"}
          </span>
          <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-zinc-200 p-4 dark:border-zinc-800">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Subcategory</dt>
              <dd className="mt-0.5">{submission.subcategory || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Barcode</dt>
              <dd className="mt-0.5">{submission.barcode || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Submitted</dt>
              <dd className="mt-0.5">{formatDate(submission.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">OCR confidence</dt>
              <dd className="mt-0.5">
                {submission.ocr_confidence != null ? `${submission.ocr_confidence.toFixed(0)}%` : "—"}
              </dd>
            </div>
          </dl>

          {submission.photo_path ? (
            <figure>
              <figcaption className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Submitted photo
              </figcaption>
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL served from private storage; next/image cannot proxy it
                <img
                  src={photoUrl}
                  alt={`Label photo for ${submission.product_name}`}
                  className="h-48 w-full rounded-xl border border-zinc-200 object-cover dark:border-zinc-800"
                />
              ) : (
                <p className="rounded-xl border border-dashed border-zinc-300 p-3 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  {photoError ? `Could not load photo: ${photoError}` : "Loading available for 60 seconds…"}
                </p>
              )}
            </figure>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">No photo submitted.</p>
          )}

          <div>
            <label htmlFor={`certification-${submission.id}`} className="mb-1 block text-sm font-medium">
              Certification visible on packaging
            </label>
            <select
              id={`certification-${submission.id}`}
              value={certification}
              onChange={(e) => setCertification(e.target.value)}
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
            <label htmlFor={`ingredients-${submission.id}`} className="mb-1 block text-sm font-medium">
              Ingredients (correct OCR errors; determines the verdict)
            </label>
            <textarea
              id={`ingredients-${submission.id}`}
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <RecomputePreview result={result} />

          {submission.category === "gmo_food" && <ConstraintNotice notice={GMO_CONSTRAINT_NOTICE} />}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void approve()}
              className="h-10 rounded-full bg-zinc-900 px-5 text-sm font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {busy === "approve" ? "Approving…" : "Approve verdict"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void reject()}
              className="h-10 rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </button>
            {actionError && (
              <p role="alert" aria-live="assertive" className="text-sm text-red-600 dark:text-red-400">
                {actionError}
              </p>
            )}
          </div>
        </div>
      )}
    </li>
  )
}