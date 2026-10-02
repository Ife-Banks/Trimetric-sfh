import "server-only"

import { isAdminSession, requireAdmin } from "@/lib/admin/api"
import { correlationId, serverError } from "@/lib/api/http"
import {
  fetchPublishedLookupConfig,
  type FluorideLookupConfig,
  type GmoLookupConfig,
} from "@/lib/config/lookupConfig"
import { composeScoringText } from "@/lib/admin/recompute"
import { gmoEngine } from "@/engines/gmoEngine"
import { fluorideEngine } from "@/engines/fluorideEngine"
import type { EngineContext, EngineResult } from "@/engines/types"
import { approvePayloadSchema } from "@/lib/validation/schemas"

// POST /api/admin/approve — one transaction through approve_submission()
// (04_BACKEND_STRUCTURE.md §4). Never two client-side calls.
export async function POST(request: Request) {
  const correlation = correlationId()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = approvePayloadSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 422 }
    )
  }

  const auth = await requireAdmin()
  if (!isAdminSession(auth)) return auth.response

  const payload = parsed.data.finalPayload
  // certification_text / concentration_text / front_photo_path were missing
  // from this select. Without the first two the recompute could not fold the
  // admin's certification mark and printed ppm into the scored text, so the
  // authoritative verdict depended on the CLIENT having pre-composed them —
  // a client sending raw ingredients_text produced a different verdict than the
  // preview the reviewer approved.
  const { data: submission, error: submissionError } = await auth.supabase
    .from("submissions")
    .select(
      "category, subcategory, ocr_confidence, photo_path, front_photo_path, certification_text, concentration_text, status"
    )
    .eq("id", parsed.data.submissionId)
    .maybeSingle()

  if (submissionError) {
    return serverError(
      "approve.lookup",
      submissionError,
      500,
      "submission_lookup_failed",
      "Could not load the submission.",
      correlation
    )
  }
  if (!submission || submission.status !== "pending") {
    return Response.json({ error: "submission_not_pending" }, { status: 409 })
  }
  if (!submission.photo_path) {
    return Response.json({ error: "submission_photo_required" }, { status: 422 })
  }
  const { error: photoError } = await auth.supabase.storage
    .from("submission-images")
    .createSignedUrl(submission.photo_path, 60)
  if (photoError) {
    return Response.json({ error: "submission_photo_unavailable" }, { status: 422 })
  }
  if (payload.category !== submission.category) {
    return Response.json({ error: "submission_category_mismatch" }, { status: 422 })
  }

  let computed: EngineResult
  try {
    const lookupConfig = await fetchPublishedLookupConfig(auth.supabase, submission.category)
    const context: EngineContext = {
      ocrMeanConfidence: submission.ocr_confidence ?? 0,
      isTruncated: false,
      identityMatch: "none",
      category: submission.category,
      subcategory: submission.subcategory ?? (submission.category === "gmo_food" ? "packaged_food" : ""),
    }
    // Same text the admin preview showed, composed server-side from the stored
    // evidence rather than trusting the client to have done it.
    const scoringText = composeScoringText(
      payload.ingredients_text,
      submission.certification_text,
      submission.concentration_text
    )
    computed = submission.category === "oral_care"
      ? fluorideEngine(scoringText, context, lookupConfig as FluorideLookupConfig)
      : gmoEngine(scoringText, context, lookupConfig as GmoLookupConfig)
  } catch (err) {
    return serverError(
      "approve.recompute",
      err,
      503,
      "published_rules_unavailable",
      "The published ruleset could not be loaded.",
      correlation
    )
  }

  // products.barcode is UNIQUE. Two submissions carrying the same barcode used
  // to raise unique_violation, roll the whole transaction back, leave the
  // submission stuck at 'pending', and surface as an opaque 500. That is a
  // likely operational case, not an edge case — barcodes identify the same
  // product. Detect it up front and tell the reviewer what to do.
  const trimmedBarcode = payload.barcode.trim()
  if (trimmedBarcode.length > 0) {
    const { data: clash, error: clashError } = await auth.supabase
      .from("products")
      .select("id, name")
      .eq("barcode", trimmedBarcode)
      .maybeSingle()
    if (clashError) {
      return serverError(
        "approve.barcode_check",
        clashError,
        500,
        "barcode_check_failed",
        "Could not check the barcode.",
        correlation
      )
    }
    if (clash) {
      return Response.json(
        {
          error: "duplicate_barcode",
          message: `Barcode ${trimmedBarcode} is already assigned to "${clash.name}". Clear the barcode or reject the duplicate product.`,
          existingProductId: clash.id,
          correlation,
        },
        { status: 409 }
      )
    }
  }

  const finalPayload = {
    ...payload,
    barcode: trimmedBarcode,
    category: submission.category,
    subcategory: computed.subcategory || submission.subcategory || payload.subcategory,
    result_tier: computed.result.tier,
    result_label: computed.result.label,
    confidence_tier: computed.confidence.tier,
    matched_terms: computed.matchedTerms,
    guidance_text: computed.guidance,
    config_version: computed.configVersion,
  }

  const { data, error } = await auth.supabase.rpc("approve_submission", {
    submission_id: parsed.data.submissionId,
    final_payload: finalPayload,
  })

  if (error) {
    // approve_submission() raises 'not authorized' for non-admins and
    // 'submission not found or already reviewed' for a stale/already-decided id.
    const status = /not authorized/i.test(error.message)
      ? 403
      : /not found|already reviewed/i.test(error.message)
        ? 409
        : /duplicate key|unique_violation/i.test(error.message)
          ? 409
          : 500
    return serverError(
      "approve.commit",
      error,
      status,
      "approve_failed",
      "The submission could not be approved.",
      correlation
    )
  }

  return Response.json({ productId: data as string, correlation })
}
