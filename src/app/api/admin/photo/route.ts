import "server-only"

import { isAdminSession, requireAdmin } from "@/lib/admin/api"

const PHOTO_PATH_PATTERN = /^pending\/[a-z0-9-]+\.(jpe?g|png)$/i
const SIGNED_URL_TTL_SECONDS = 60 // 04_BACKEND_STRUCTURE.md §6 — short TTL

// GET /api/admin/photo?path=pending/<uuid>.jpg
// Short-lived signed URL for a submission photo. The bucket stays private and
// URLs are minted server-side under the admin's session — the storage policy
// `submission_read_admin` means a non-admin session cannot mint one at all.
export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? ""
  if (!PHOTO_PATH_PATTERN.test(path)) {
    return Response.json({ error: "invalid_path" }, { status: 400 })
  }

  const auth = await requireAdmin()
  if (!isAdminSession(auth)) return auth.response

  const { data, error } = await auth.supabase.storage
    .from("submission-images")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (error || !data) {
    return Response.json({ error: "signed_url_failed", message: error?.message }, { status: 404 })
  }

  return Response.json({ url: data.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS })
}