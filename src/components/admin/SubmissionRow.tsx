"use client"

// One pending submission, expandable. Expansion fetches a short-lived signed
// URL for the photo (never a public URL — 04 §6, SEC-05), lets the admin
// correct the ingredients text / certification / concentration, shows a live
// rules-engine recompute of THOSE corrected values, and approves/rejects.
// Approve posts the recomputed EngineResult to approve_submission() — the
// verdict is never typed. Both categories share this row: GMO exposes the
// certification short-circuit, oral care the printed concentration/PPM.

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ScanText } from "lucide-react"
import type { SubmissionForReview } from "@/lib/admin/recompute"
import { fetchPublishedLookupConfig, type LookupConfig } from "@/lib/config/lookupConfig"
import { getSupabaseBrowser } from "@/lib/supabase/client"
import { composeScoringText, recomputeVerdict } from "@/lib/admin/recompute"
import { RecomputePreview } from "@/components/admin/RecomputePreview"
import { ConstraintNotice } from "@/components/verdict/ConstraintNotice"
import { CategoryBadge } from "@/components/ui/category-badge"
import { GMO_CONSTRAINT_NOTICE } from "@/engines/gmoEngine"
import { FLUORIDE_CONSTRAINT_NOTICE } from "@/engines/fluorideEngine"
import { InlineAlert } from "@/components/ui/inline-alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

const NONE = "none"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function ocrLabel(submission: SubmissionForReview): string {
  return submission.ocr_confidence != null ? `${(submission.ocr_confidence * 100).toFixed(0)}%` : "—"
}

export function SubmissionRow({ submission }: { submission: SubmissionForReview }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [frontPhotoUrl, setFrontPhotoUrl] = useState<string | null>(null)
  const [photoLoaded, setPhotoLoaded] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  // Front-photo state is deliberately separate. It previously wrote to the
  // shared `photoError`, so a 404 on the FRONT photo suppressed retries of the
  // ingredients photo permanently and wedged the whole row.
  const [frontPhotoError, setFrontPhotoError] = useState<string | null>(null)
  const [ingredients, setIngredients] = useState(submission.ingredients_text)
  const [certification, setCertification] = useState(submission.certification_text ?? "")
  const [concentration, setConcentration] = useState(submission.concentration_text ?? "")
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [lookupConfig, setLookupConfig] = useState<LookupConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)

  const isGmo = submission.category === "gmo_food"

  // No reset effect here: a submission's category is immutable, so the ruleset
  // loaded for it can never become stale. Resetting it in an effect on open
  // (as this used to) was a synchronous setState that triggered a cascading
  // render on every expansion — and it blanked the recompute preview each time
  // the reviewer opened the row.
  useEffect(() => {
    if (!open) return
    let active = true
    void fetchPublishedLookupConfig(getSupabaseBrowser(), submission.category)
      .then((config) => {
        if (active) setLookupConfig(config)
      })
      .catch((error: unknown) => {
        if (active) setConfigError(error instanceof Error ? error.message : "Could not load published rules.")
      })
    return () => {
      active = false
    }
  }, [open, submission.category])

  const result = useMemo(
    () => lookupConfig ? recomputeVerdict(ingredients, certification, submission, lookupConfig, concentration) : null,
    [ingredients, certification, concentration, submission, lookupConfig]
  )
  const certificationOptions = lookupConfig && "certification_short_circuit" in lookupConfig
    ? lookupConfig.certification_short_circuit.terms
    : []
  const scoringText = composeScoringText(ingredients, certification, isGmo ? undefined : concentration)

  // Approval requires a rendered photo (SEC-07). A submission with no photo at
  // all is not blocked by the *loading* state — it is blocked because there is
  // nothing to review, which is a different and clearly-worded condition.
  const photoRequired = Boolean(submission.photo_path)
  const canApprove = busy === null && result !== null && (!photoRequired || photoLoaded)

  async function fetchPhoto() {
    if (photoUrl || photoError || !submission.photo_path) return
    try {
      const res = await fetch(`/api/admin/photo?path=${encodeURIComponent(submission.photo_path)}`)
      if (!res.ok) throw new Error(`Photo request failed (${res.status})`)
      const body = (await res.json()) as { url: string }
      setPhotoLoaded(false)
      setPhotoUrl(body.url)
      setPhotoError(null)
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Could not load photo")
    }
  }

  async function fetchFrontPhoto() {
    const path = submission.front_photo_path
    if (!path || frontPhotoUrl || frontPhotoError) return
    try {
      const res = await fetch(`/api/admin/photo?path=${encodeURIComponent(path)}`)
      if (!res.ok) throw new Error(`Photo request failed (${res.status})`)
      const body = (await res.json()) as { url: string }
      setFrontPhotoUrl(body.url)
      setFrontPhotoError(null)
    } catch (error) {
      setFrontPhotoError(error instanceof Error ? error.message : "Could not load front photo")
    }
  }

  async function onToggle() {
    const next = !open
    setOpen(next)
    if (next) {
      void fetchPhoto()
      void fetchFrontPhoto()
    }
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
      // The product row carries the ENGINE-resolved subcategory (e.g. an oral
      // care tooth/gel vs mouthwash) so future scans route to the right ppm
      // table; the submitted value is a fallback when the engine resolved none.
      subcategory: result.subcategory || submission.subcategory || "",
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
          {configError ? (
            <InlineAlert variant="destructive">Published rules unavailable: {configError}</InlineAlert>
          ) : !lookupConfig ? (
            <p className="text-sm text-muted-foreground">Loading the published ruleset…</p>
          ) : null}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-overline uppercase text-muted-foreground">Subcategory</dt>
              <dd className="mt-0.5">{submission.subcategory || "—"}</dd>
            </div>
            {isGmo && (
              <div>
                <dt className="text-overline uppercase text-muted-foreground">User-reported GMO label status</dt>
                <dd className="mt-0.5">{{ non_gmo_certified: "Non-GMO certified claim", contains_gmo: "Contains GMO claim", not_sure: "Not sure / review requested" }[submission.gmo_status ?? "not_sure"]}</dd>
              </div>
            )}
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
                {ocrLabel(submission)}
              </dd>
            </div>
          </dl>

          {submission.photo_path ? (
            <div className="grid grid-cols-2 gap-3">
              <figure>
                <figcaption className="mb-1.5 text-overline uppercase text-muted-foreground">Ingredients / back label</figcaption>
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL served from private storage; next/image cannot proxy it
                  <img src={photoUrl} alt={`Ingredients label for ${submission.product_name}`} className="h-36 w-full rounded-xl border object-cover" onLoad={() => setPhotoLoaded(true)} onError={() => { setPhotoLoaded(false); setPhotoError("The submitted photo could not be displayed."); setPhotoUrl(null) }} />
                ) : photoError ? <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">Could not load photo.</p> : <Skeleton className="h-36 w-full rounded-xl" aria-label="Loading ingredients photo" />}
              </figure>
              {submission.front_photo_path && (
                <figure>
                  <figcaption className="mb-1.5 text-overline uppercase text-muted-foreground">Product name / front label</figcaption>
                  {frontPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL served from private storage; next/image cannot proxy it
                    <img src={frontPhotoUrl} alt={`Product front label for ${submission.product_name}`} className="h-36 w-full rounded-xl border object-cover" />
                  ) : frontPhotoError ? <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">Could not load front photo.</p> : <Skeleton className="h-36 w-full rounded-xl" aria-label="Loading product front photo" />}
                </figure>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No photo submitted.</p>
          )}

          {isGmo ? (
            <div className="space-y-1.5">
              <Label htmlFor={`certification-${submission.id}`}>Certification visible on packaging</Label>
              <Select
                value={certification || NONE}
                onValueChange={(v) => setCertification(v === NONE ? "" : v)}
              >
                <SelectTrigger id={`certification-${submission.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None visible</SelectItem>
                  {certificationOptions.map((cert) => (
                    <SelectItem key={cert} value={cert}>
                      {cert}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor={`concentration-${submission.id}`}>
                Printed concentration / PPM
              </Label>
              <Input
                id={`concentration-${submission.id}`}
                value={concentration}
                onChange={(e) => setConcentration(e.target.value)}
                placeholder="e.g. 1450 ppm or 0.24% — only if it was on the label"
              />
            </div>
          )}

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

          <ConstraintNotice notice={isGmo ? GMO_CONSTRAINT_NOTICE : FLUORIDE_CONSTRAINT_NOTICE} />

          {/* SEC-07: the reviewer must actually see the label before approving,
              so approval stays blocked until the photo has rendered. Previously
              the button was disabled on `!photoLoaded` with no explanation, and
              a submission with no photo (or a broken one) left it permanently
              greyed out with no way to tell why. */}
          {photoRequired && !photoLoaded && !photoError && (
            <p className="text-xs text-muted-foreground">
              Waiting for the submitted photo to load before this can be approved.
            </p>
          )}
          {photoError && (
            <p className="text-xs text-muted-foreground">
              The submitted photo could not be displayed. Reject this submission, or
              ask the contributor to resubmit with a readable photo.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={!canApprove} onClick={() => void approve()}>
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
