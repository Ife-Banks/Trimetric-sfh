"use client"

// One pending submission, expandable. Expansion fetches a short-lived signed
// URL for the photo (never a public URL — 04 §6, SEC-05), lets the admin
// correct the ingredients text / certification, shows a live rules-engine
// recompute of THOSE corrected values, and approves/rejects. Approve posts the
// recomputed EngineResult to approve_submission() — the verdict is never typed.

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ScanText } from "lucide-react"
import config from "../../../data/gmo_lookup_config_v1.0.json"
import type { SubmissionForReview } from "@/lib/admin/recompute"
import { composeScoringText, recomputeVerdict } from "@/lib/admin/recompute"
import { RecomputePreview } from "@/components/admin/RecomputePreview"
import { ConstraintNotice } from "@/components/verdict/ConstraintNotice"
import { CategoryBadge } from "@/components/ui/category-badge"
import { GMO_CONSTRAINT_NOTICE } from "@/engines/gmoEngine"
import { InlineAlert } from "@/components/ui/inline-alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { StatusBadge } from "@/components/ui/status-badge"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "cn"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

const CERT_NONE = "none"

const CERT_OPTIONS: string[] = config.certification_short_circuit.terms

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function ocrLabel(submission: SubmissionForReview): string {
  return submission.ocr_confidence != null ? `${submission.ocr_confidence.toFixed(0)}%` : "—"
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
      toast.success("Verdict approved", {
        description: `${submission.product_name} is now in the verified dataset.`,
      })
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
      toast.success("Submission rejected", {
        description: `${submission.product_name} will not enter the dataset.`,
      })
      router.refresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Reject failed")
      setBusy(null)
    }
  }

  return (
    <li className="rounded-lg border bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => void onToggle()}
        aria-expanded={open}
        className={cn(
          "flex min-h-12 w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 text-left transition-colors outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "md:grid md:grid-cols-[minmax(0,1fr)_11rem_9rem_5rem_2rem] md:gap-4 md:px-5",
          open && "border-b bg-surface-muted/60 hover:bg-surface-muted"
        )}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {submission.product_name || "Unnamed product"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {submission.brand || "Unbranded"} · {formatDate(submission.created_at)}
          </span>
        </span>

        <CategoryBadge category={submission.category} />

        <span className="hidden text-xs text-muted-foreground md:flex md:items-center md:self-center">
          {new Date(submission.created_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>

        <StatusBadge
          variant="neutral"
          icon={<ScanText />}
          className="hidden md:inline-flex"
        >
          OCR {ocrLabel(submission)}
        </StatusBadge>

        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200 md:justify-self-end md:self-center",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="space-y-4 border-t p-4 md:p-5">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-overline uppercase text-muted-foreground">Subcategory</dt>
              <dd className="mt-0.5">{submission.subcategory || "—"}</dd>
            </div>
            <div>
              <dt className="text-overline uppercase text-muted-foreground">Barcode</dt>
              <dd className="mt-0.5">{submission.barcode || "—"}</dd>
            </div>
            <div>
              <dt className="text-overline uppercase text-muted-foreground">Submitted</dt>
              <dd className="mt-0.5">{formatDate(submission.created_at)}</dd>
            </div>
            <div>
              <dt className="text-overline uppercase text-muted-foreground">OCR confidence</dt>
              <dd className="mt-0.5">
                {submission.ocr_confidence != null ? `${submission.ocr_confidence.toFixed(0)}%` : "—"}
              </dd>
            </div>
          </dl>

          {submission.photo_path ? (
            <figure>
              <figcaption className="mb-1.5 text-overline uppercase text-muted-foreground">
                Submitted photo
              </figcaption>
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL served from private storage; next/image cannot proxy it
                <img
                  src={photoUrl}
                  alt={`Label photo for ${submission.product_name}`}
                  className="h-48 w-full rounded-xl border object-cover"
                />
              ) : photoError ? (
                <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                  Could not load photo: {photoError}
                </p>
              ) : (
                <Skeleton className="h-48 w-full rounded-xl" aria-label="Loading submitted photo" />
              )}
            </figure>
          ) : (
            <p className="text-xs text-muted-foreground">No photo submitted.</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`certification-${submission.id}`}>Certification visible on packaging</Label>
            <Select
              value={certification || CERT_NONE}
              onValueChange={(v) => setCertification(v === CERT_NONE ? "" : v)}
            >
              <SelectTrigger id={`certification-${submission.id}`} className="w-full">
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`ingredients-${submission.id}`}>
              Ingredients (correct OCR errors; determines the verdict)
            </Label>
            <Textarea
              id={`ingredients-${submission.id}`}
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              rows={5}
            />
          </div>

          <RecomputePreview result={result} />

          {submission.category === "gmo_food" && <ConstraintNotice notice={GMO_CONSTRAINT_NOTICE} />}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={busy !== null} onClick={() => void approve()}>
              {busy === "approve" ? (
                <>
                  <Spinner /> Approving…
                </>
              ) : (
                "Approve verdict"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              disabled={busy !== null}
              onClick={() => void reject()}
            >
              {busy === "reject" ? (
                <>
                  <Spinner /> Rejecting…
                </>
              ) : (
                "Reject"
              )}
            </Button>
            {actionError && (
              <InlineAlert variant="destructive" className="w-full sm:w-auto">
                {actionError}
              </InlineAlert>
            )}
          </div>
        </div>
      )}
    </li>
  )
}