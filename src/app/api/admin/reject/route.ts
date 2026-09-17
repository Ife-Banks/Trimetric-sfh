import "server-only"

import { isAdminSession, requireAdmin } from "@/lib/admin/api"
import { rejectPayloadSchema } from "@/lib/validation/schemas"

// POST /api/admin/reject — status only (04_BACKEND_STRUCTURE.md §3). No delete,
// no write to products. RLS `submissions_update_admin` still governs the write,
// so a non-admin token updates zero rows even if the route guard were bypassed.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = rejectPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 422 }
    )
  }

  const auth = await requireAdmin()
  if (!isAdminSession(auth)) return auth.response

  const { data, error } = await auth.supabase
    .from("submissions")
    .update({
      status: "rejected",
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
      review_note: parsed.data.reviewNote || null,
    })
    .eq("id", parsed.data.submissionId)
    .eq("status", "pending")
    .select("id")

  if (error) {
    return Response.json({ error: "reject_failed", message: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) {
    // Nothing updated: either the row is gone/already reviewed, or RLS denied it.
    return Response.json({ error: "not_found_or_not_authorized" }, { status: 404 })
  }

  return Response.json({ ok: true })
}