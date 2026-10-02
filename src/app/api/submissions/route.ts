import "server-only"

import { getServerSupabase, getUserServerSupabase } from "@/lib/supabase/server"
import { createRateLimiter } from "@/lib/rateLimit"
import { correlationId, serverError } from "@/lib/api/http"
import { SUBMISSION_RATE_LIMIT, submissionPayloadSchema } from "@/lib/validation/schemas"

// Per-process sliding-window limiter (in-memory). State is per Node instance,
// so a cold start resets the window and N instances each allow N× the limit.
// It is defence in depth only — the primary control for anonymous writes is
// the hardened `submissions_insert_anon` RLS policy (migration
// 20260930090000_harden_submission_inserts), because the anon key ships in the
// client bundle and a direct PostgREST INSERT bypasses this route entirely.
const limiter = createRateLimiter({
  windowMs: SUBMISSION_RATE_LIMIT.windowMs,
  max: SUBMISSION_RATE_LIMIT.max,
})

// `x-forwarded-for` is client-settable: anything that APPENDS rather than
// overwrites it lets a caller send a fresh value per request and get an
// unlimited per-IP budget. We only trust it when it is a single well-formed IP
// (i.e. our own edge is the only proxy that touched it), and we prefer the
// platform-provided headers. Everything else falls into one shared bucket
// rather than failing open per-request.
const IP_PATTERN = /^[0-9a-fA-F:.]{3,45}$/;

function clientIp(request: Request): string {
  const platformIp =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    null;
  if (platformIp && IP_PATTERN.test(platformIp.trim())) return platformIp.trim();

  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
    // A single hop means only one trusted proxy wrote it.
    if (hops.length === 1 && IP_PATTERN.test(hops[0])) return hops[0];
    if (hops.length > 1 && hops.every((h) => IP_PATTERN.test(h))) {
      // Right-most hop was appended by the closest trusted proxy.
      return hops[hops.length - 1];
    }
  }
  // Unrecognised/absent: collapse into ONE shared bucket so it fails closed.
  return "unattributed";
}

function rateLimitResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "rate_limited", message: "Too many submissions. Try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  )
}

export async function POST(request: Request) {
  const correlation = correlationId()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid_json", message: "Request body is not valid JSON" }, { status: 400 })
  }

  const parsed = submissionPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 422 }
    )
  }
  const payload = parsed.data

  const ip = clientIp(request)

  // Per-IP quota with the coarse client fingerprint as a secondary key — both
  // must allow the request (02_SYSTEM_ARCHITECTURE.md §4.3).
  const ipState = limiter.check(`ip:${ip}`)
  if (!ipState.allowed) return rateLimitResponse(ipState.retryAfterSeconds)

  const fpState = limiter.check(`fp:${payload.fingerprint}`)
  if (!fpState.allowed) return rateLimitResponse(fpState.retryAfterSeconds)

  // Pending cap per fingerprint, enforced through a SECURITY DEFINER count
  // function (anon cannot SELECT submissions under RLS).
  const { data: pendingCount, error: countError } = await getServerSupabase()
    .rpc("count_pending_submissions", { fp: payload.fingerprint })
  if (!countError && typeof pendingCount === "number" && pendingCount >= SUBMISSION_RATE_LIMIT.maxPendingPerFingerprint) {
    return Response.json(
      {
        error: "pending_cap",
        message: "You already have pending submissions under review. Please wait for those to be processed.",
      },
      { status: 429 }
    )
  }

  const supabase = await getUserServerSupabase()

  // Signed-in users get their submissions attributed (history page). Anonymous
  // users remain fully supported — submitted_by stays NULL.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // NOTE: no `.select().single()` here — that would emit `INSERT ... RETURNING`,
  // and returning the row back to an anonymous client would be denied by the
  // `submissions_read_admin` RLS policy (anon must never read submissions).
  const { error } = await supabase
    .from("submissions")
    .insert({
      category: payload.category,
      subcategory: payload.subcategory,
      product_name: payload.productName,
      brand: payload.brand || null,
      barcode: payload.barcode || null,
      ingredients_text: payload.ingredientsText,
      certification_text: payload.certificationText || null,
      concentration_text: payload.concentrationText || null,
      photo_path: payload.photoPath,
      front_photo_path: payload.frontPhotoPath,
      gmo_status: payload.gmoStatus,
      ocr_confidence: payload.ocrConfidence ?? null,
      engine_preview: payload.enginePreview,
      submitter_fingerprint: payload.fingerprint,
      submitted_by: user?.id ?? null,
    })

  if (error) {
    return serverError(
      "submissions.insert",
      error,
      500,
      "insert_failed",
      "Could not record the submission. Please try again.",
      correlation
    )
  }

  return Response.json(
    { ok: true, correlation },
    {
      status: 201,
      headers: {
        "X-RateLimit-Remaining": String(Math.min(ipState.remaining, fpState.remaining)),
      },
    }
  )
}
