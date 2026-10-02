"use client"

// SubmissionForm — the low-confidence contribution loop (GMO_Build_Guide.md §9,
// 03_FRONTEND_ARCHITECTURE.md §3, fluoride submission_form_schema). Every field
// pre-fills from what the engine extracted; the user is correcting, not
// authoring. Photo is auto-attached from the capture step (never re-asked).
// Canvas re-encode strips EXIF before the upload; the row lands via
// /api/submissions (Zod + rate limit + RLS). The two categories share the form:
// GMO asks for a visible certification, oral care for subcategory + active
// compound + printed concentration/PPM (the compound folds into ingredients_text
// exactly as certification does — there is no active_compound column).

import { useEffect, useMemo, useRef, useState } from "react"
import { Camera, CheckCircle2, ClipboardCheck, ShieldCheck } from "lucide-react"
import type { EngineResult } from "@/engines/types"
import type { LookupConfig } from "@/lib/config/lookupConfig"
import { getSupabaseBrowser } from "@/lib/supabase/client"
import { referenceFromPhotoPath } from "@/lib/upload/reference"
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
import { Panel } from "@/components/ui/panel"
import { Overline } from "@/components/ui/overline"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Radix Select items can't carry an empty-string value; "none" maps to "".
const NONE = "none"

export interface SubmissionPrefill {
  productName: string
  brand: string
  ingredientsText: string
  barcode?: string | null
}

const DRAFT_KEY = "shf:submission-draft"
interface Draft {
  productName: string
  brand: string
  ingredientsText: string
  certificationText: string
  subcategory: string
  activeCompoundId: string
  concentrationText: string
  gmoStatus: "non_gmo_certified" | "contains_gmo" | "not_sure"
}

// The draft is scoped to the product it was typed for. It was a single global
// key, so abandoning the add-product screen for product A and then scanning
// product B pre-filled B's form with A's name, brand, ingredients, subcategory
// and compound — submitting one product's ingredient text as evidence for
// another. The reviewer recomputes from that text, so it is a genuine
// data-integrity bug, not just an annoyance.
function draftIdentity(category: string, prefill: SubmissionPrefill): string {
  const name = prefill.productName.trim().toLowerCase().replace(/\s+/g, " ")
  const brand = prefill.brand.trim().toLowerCase().replace(/\s+/g, " ")
  return `${category}|${brand}|${name}`
}

function emptyDraft(
  prefill: SubmissionPrefill,
  cert: string,
  subcategory: string,
  activeCompoundId: string
): Draft {
  return {
    productName: prefill.productName,
    brand: prefill.brand,
    ingredientsText: prefill.ingredientsText,
    certificationText: cert,
    subcategory,
    activeCompoundId,
    concentrationText: "",
    gmoStatus: "not_sure",
  }
}

function loadDraft(
  identity: string,
  prefill: SubmissionPrefill,
  cert: string,
  subcategory: string,
  activeCompoundId: string
): Draft {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return emptyDraft(prefill, cert, subcategory, activeCompoundId)
    const stored = JSON.parse(raw) as { identity?: unknown; draft?: Partial<Draft> }
    // Only resume a draft that belongs to THIS product.
    if (!stored || stored.identity !== identity || typeof stored.draft !== "object" || stored.draft === null) {
      return emptyDraft(prefill, cert, subcategory, activeCompoundId)
    }
    const parsed = stored.draft
    const base = emptyDraft(
      {
        productName: typeof parsed.productName === "string" && parsed.productName ? parsed.productName : prefill.productName,
        brand: typeof parsed.brand === "string" ? parsed.brand : prefill.brand,
        ingredientsText: typeof parsed.ingredientsText === "string" && parsed.ingredientsText ? parsed.ingredientsText : prefill.ingredientsText,
        barcode: prefill.barcode,
      },
      typeof parsed.certificationText === "string" ? parsed.certificationText : cert,
      typeof parsed.subcategory === "string" && parsed.subcategory ? parsed.subcategory : subcategory,
      typeof parsed.activeCompoundId === "string" ? parsed.activeCompoundId : activeCompoundId
    )
    base.concentrationText =
      typeof parsed.concentrationText === "string" ? parsed.concentrationText : ""
    if (parsed.gmoStatus === "non_gmo_certified" || parsed.gmoStatus === "contains_gmo" || parsed.gmoStatus === "not_sure") {
      base.gmoStatus = parsed.gmoStatus
    }
    return base
  } catch {
    return emptyDraft(prefill, cert, subcategory, activeCompoundId)
  }
}

// The receipt reference is derived from the storage photo path (see
// lib/upload/reference.ts); re-exported here for callers that react to
// onSuccess.
export { referenceFromPhotoPath } from "@/lib/upload/reference"

export function SubmissionForm({
  result,
  lookupConfig,
  prefill,
  photo,
  frontPhoto,
  ocrConfidence,
  onSuccess,
}: {
  result: EngineResult
  lookupConfig: LookupConfig
  prefill: SubmissionPrefill
  photo: { blob: Blob; url: string } | null
  frontPhoto: { blob: Blob; url: string } | null
  ocrConfidence?: number
  onSuccess: (reference: string, product: { productName: string; brand: string }) => void
}) {
  const fingerprint = useMemo(() => coarseClientFingerprint(), [])
  const isGmo = result.category === "gmo_food"
  const gmoConfig = "certification_short_circuit" in lookupConfig ? lookupConfig : null
  const fluorideConfig = "terms_lookup_table" in lookupConfig ? lookupConfig : null
  const certificationOptions = gmoConfig?.certification_short_circuit.terms ?? []
  const fluorideCompounds = fluorideConfig?.terms_lookup_table.map((row) => ({
    id: row.term_id,
    label: row.normalized_term,
    raw: row.raw_term,
  })) ?? []
  const fluorideSubcategories = Object.keys(fluorideConfig?.category_ppm_tables ?? {})
  const matchedCert = result.matchedTerms.find((t) => t.kind === "certification")?.term ?? ""
  const matchedCompound = result.matchedTerms.find((t) => t.kind === "active_compound")
  const matchedCompoundId =
    fluorideCompounds.find(
      (c) => c.raw.toLowerCase() === matchedCompound?.normalized.toLowerCase()
    )?.id ?? NONE
  const matchedSubcategory =
    result.subcategory && fluorideSubcategories.includes(result.subcategory)
      ? result.subcategory
      : ""

  const identity = useMemo(
    () => draftIdentity(result.category, prefill),
    [result.category, prefill]
  )

  const [draft, setDraft] = useState<Draft>(() =>
    loadDraft(identity, prefill, matchedCert, matchedSubcategory, matchedCompoundId)
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const firstInit = useRef(false)

  // Persist the draft so a failed upload doesn't lose the user's typing.
  useEffect(() => {
    if (!firstInit.current) {
      firstInit.current = true
      return
    }
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ identity, draft }))
  }, [draft, identity])

  useEffect(() => () => window.sessionStorage.removeItem(DRAFT_KEY), [])

  const certification = draft.certificationText
  const selectedCompound = fluorideCompounds.find((c) => c.id === draft.activeCompoundId)

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
    // Subcategory drives which ppm table the recompute applies — the config
    // submission schema marks it required for oral care.
    if (!isGmo && !draft.subcategory) {
      setError("Select the product subcategory (toothpaste or mouthwash).")
      return
    }
    if (!photo) {
      setError("A photo is required. Please retake the label photo.")
      return
    }
    if (!frontPhoto) {
      setError("The front package photo is missing. Please retake the product-name photo.")
      return
    }

    setSubmitting(true)
    try {
      const supabase = getSupabaseBrowser()
      const jpeg = await encodeUploadImage(photo.blob)
      const frontJpeg = await encodeUploadImage(frontPhoto.blob)
      const { path: photoPath } = await uploadSubmissionImage(supabase, jpeg)
      const { path: frontPhotoPath } = await uploadSubmissionImage(supabase, frontJpeg)

      // The selected compound joins the scoring text exactly as certification
      // does on the GMO side — no active_compound column exists, and the admin
      // recompute must see the compound to match its regex.
      const scoringText = isGmo
        ? ingredientsText
        : selectedCompound && !ingredientsText.toLowerCase().includes(selectedCompound.raw.toLowerCase())
          ? `${selectedCompound.raw}, ${ingredientsText}`
          : ingredientsText

      const payload: SubmissionPayload = {
        category: result.category,
        subcategory: isGmo ? result.subcategory : draft.subcategory || result.subcategory,
        productName,
        brand: draft.brand.trim(),
        barcode: prefill.barcode ?? "",
        ingredientsText: scoringText,
        certificationText: isGmo ? certification : "",
        concentrationText: isGmo ? "" : draft.concentrationText.trim(),
        photoPath,
        frontPhotoPath,
        gmoStatus: isGmo ? draft.gmoStatus : null,
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
      onSuccess(referenceFromPhotoPath(photoPath), { productName, brand: draft.brand.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <Panel variant="elevated" padding="md" className="space-y-3 border-border/70">
        <div className="flex items-center justify-between gap-2">
          <Overline>Product details</Overline>
          <span className="rounded-full bg-success/10 px-2 py-1 text-[10px] font-semibold text-success">Review needed</span>
        </div>
        <Field label="Product name" htmlFor="product-name" required>
          <Input
            id="product-name"
            name="product-name"
            value={draft.productName}
            onChange={(e) => setDraft((d) => ({ ...d, productName: e.target.value }))}
          />
        </Field>
        <Field label="Brand or manufacturer" htmlFor="brand">
          <Input
            id="brand"
            name="brand"
            value={draft.brand}
            onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
          />
        </Field>
      </Panel>

      <Panel variant="elevated" padding="sm" className="space-y-3 border-border/70">
        <div className="flex items-center gap-2">
          <Camera className="size-4 text-accent-gmo" aria-hidden="true" />
          <Overline>Label evidence &amp; packaging</Overline>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">Both package photos are attached as private evidence for the reviewer.</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Front: product name", image: frontPhoto },
            { label: "Back: ingredients", image: photo },
          ].map(({ label, image }) => (
            <div key={label} className="space-y-1">
              <p className="text-[10px] font-medium">{label}</p>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element -- local capture object URLs are not optimizable by next/image
                <img src={image.url} alt={`Captured ${label}`} className="h-20 w-full rounded-lg border border-border/70 object-cover" />
              ) : <div className="grid h-20 place-items-center rounded-lg border border-dashed text-[10px] text-muted-foreground">Photo missing</div>}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">Images are re-encoded before secure upload; location metadata is removed.</p>
      </Panel>

      <Panel variant="elevated" padding="sm" className="space-y-3 border-border/70">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-accent-gmo" aria-hidden="true" />
          <Overline>Known label details</Overline>
        </div>
        {isGmo && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Select the GMO status shown on the product</legend>
            <p className="text-[10px] leading-relaxed text-muted-foreground">This is a user-reported label statement for reviewer context, not an independently verified result.</p>
            {([
              ["non_gmo_certified", "Non-GMO certified", "The packaging displays a non-GMO certification"],
              ["contains_gmo", "Contains GMO ingredients", "The label indicates engineered ingredients"],
              ["not_sure", "Not sure / require review", "I cannot confidently identify the status"],
            ] as const).map(([value, title, description]) => (
              <label key={value} className={`flex cursor-pointer gap-2 rounded-lg border p-2.5 ${draft.gmoStatus === value ? "border-success bg-success/5" : "border-border"}`}>
                <input type="radio" name="gmo-status" value={value} checked={draft.gmoStatus === value} onChange={() => setDraft((d) => ({ ...d, gmoStatus: value }))} className="mt-0.5 accent-emerald-700" />
                <span className="min-w-0"><span className="block text-xs font-semibold">{title}</span><span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">{description}</span></span>
                {draft.gmoStatus === value && <CheckCircle2 className="ml-auto size-4 shrink-0 text-success" aria-hidden="true" />}
              </label>
            ))}
          </fieldset>
        )}
        {isGmo && <div className="flex items-center gap-2 pt-1"><ShieldCheck className="size-4 text-accent-gmo" aria-hidden="true" /><Overline>Certifications / third-party marks</Overline></div>}
      {isGmo ? (
        <Field
          label="Certification wording visible on the label"
          htmlFor="certification"
          noClone
          helper="Choose wording you can read on the packaging; this is not an independent certification check."
        >
          <Select
            value={certification || NONE}
            onValueChange={(v) =>
              setDraft((d) => ({ ...d, certificationText: v === NONE ? "" : v }))
            }
          >
            <SelectTrigger id="certification" className="w-full">
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
        </Field>
      ) : (
        <>
          <Field
            label="Subcategory"
            htmlFor="subcategory"
            required
            helper="Drives which concentration table applies (toothpaste vs mouthwash)."
          >
            <Select
              value={draft.subcategory || NONE}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, subcategory: v === NONE ? "" : v }))
              }
            >
              <SelectTrigger id="subcategory" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not sure</SelectItem>
                {fluorideSubcategories.map((sub) => (
                  <SelectItem key={sub} value={sub}>
                    {sub === "toothpaste_gel" ? "Toothpaste / gel" : "Mouthwash / rinse"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Active compound (if visible on packaging)" htmlFor="active-compound" noClone>
            <Select
              value={draft.activeCompoundId || NONE}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, activeCompoundId: v === NONE ? "" : v }))
              }
            >
              <SelectTrigger id="active-compound" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not sure</SelectItem>
                {fluorideCompounds.map((compound) => (
                  <SelectItem key={compound.id} value={compound.id}>
                    {compound.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Concentration / PPM as printed"
            htmlFor="concentration"
            helper="e.g. 1450 ppm or 0.24%. Only if visible on the label — this is the difference between a stored and a derived value."
          >
            <Input
              id="concentration"
              name="concentration"
              value={draft.concentrationText}
              placeholder="e.g. 1450 ppm"
              onChange={(e) =>
                setDraft((d) => ({ ...d, concentrationText: e.target.value }))
              }
            />
          </Field>
        </>
      )}
      </Panel>

      <Panel variant="elevated" padding="sm" className="space-y-3 border-border/70">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-accent-gmo" aria-hidden="true" />
          <Overline>Scanned ingredients text</Overline>
        </div>
        <Field label="Ingredients text" htmlFor="ingredients-text" required helper="Check the scanned text and correct anything OCR misread.">
          <Textarea
            id="ingredients-text"
            name="ingredients-text"
            value={draft.ingredientsText}
            onChange={(e) => setDraft((d) => ({ ...d, ingredientsText: e.target.value }))}
            rows={5}
          />
        </Field>
      </Panel>

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
          "Submit Product for Verification"
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground" aria-live="polite">
        Your correction goes to a human reviewer before it affects anyone&apos;s verdict.
      </p>
    </form>
  )
}
