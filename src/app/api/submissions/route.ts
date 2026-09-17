import "server-only"

import { getServerSupabase } from "@/lib/supabase/server"
import { createRateLimiter } from "@/lib/rateLimit"
import { SUBMISSION_RATE_LIMIT, submissionPayloadSchema } from "@/lib/validation/schemas"

// Per-process sliding-window limiter (in-memory). Fine for a single Next node;
// Phase 7 hardening can swap the backend for something shared (Redis) if the
// app is ever run multi-instance.
const limiter = createRateLimiter({
  windowMs: SUBMISSION_RATE_LIMIT.windowMs,
  max: SUBMISSION_RATE_LIMIT.max,
})

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")
  const first = fwd?.split(",")[0]?.trim()
  return first && first.length > 0 ? first : "unknown"
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

  const supabase = getServerSupabase()

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
      ocr_confidence: payload.ocrConfidence ?? null,
      engine_preview: payload.enginePreview,
      submitter_fingerprint: payload.fingerprint,
    })

  if (error) {
    return Response.json(
      { error: "insert_failed", message: error?.message ?? "Could not record the submission." },
      { status: 500 }
    )
  }

  return Response.json(
    { ok: true },
    {
      status: 201,
      headers: {
        "X-RateLimit-Remaining": String(Math.min(ipState.remaining, fpState.remaining)),
      },
    }
  )
}