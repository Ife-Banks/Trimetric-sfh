import "server-only"

import { isAdminSession, requireAdmin } from "@/lib/admin/api"
import { approvePayloadSchema } from "@/lib/validation/schemas"

// POST /api/admin/approve — one transaction through approve_submission()
// (04_BACKEND_STRUCTURE.md §4). Never two client-side calls.
export async function POST(request: Request) {
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

  const { data, error } = await auth.supabase.rpc("approve_submission", {
    submission_id: parsed.data.submissionId,
    final_payload: parsed.data.finalPayload,
  })

  if (error) {
    // approve_submission() raises 'not authorized' for non-admins and
    // 'submission not found or already reviewed' for a stale/already-decided id.
    const status = /not authorized/i.test(error.message)
      ? 403
      : /not found|already reviewed/i.test(error.message)
        ? 409
        : 500
    return Response.json({ error: "approve_failed", message: error.message }, { status })
  }

  return Response.json({ productId: data as string })
}