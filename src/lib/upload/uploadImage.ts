// Client-side upload path for submission photos. The canvas re-encode is the
// EXIF strip: decoding → draw → toBlob writes a brand-new JPEG with no EXIF or
// GPS leftovers (SEC-05/09), and normalises whatever the capture produced to a
// JPEG at ~1600px long edge (same bound 03_FRONTEND_ARCHITECTURE.md §6 uses for
// OCR). Upload goes to the private `submission-images` bucket under pending/.

import type { SupabaseClient } from "@supabase/supabase-js"
import { downscaleBlob } from "@/lib/ocr/image"

const UPLOAD_MAX_LONG_EDGE = 1600
const UPLOAD_JPEG_QUALITY = 0.85

export { UPLOAD_MAX_LONG_EDGE }

// Re-encode the captured photo as a fresh JPEG. Never upscales; strips EXIF by
// construction.
export async function encodeUploadImage(
  blob: Blob,
  opts: { maxLongEdge?: number; quality?: number } = {}
): Promise<File> {
  const maxLongEdge = opts.maxLongEdge ?? UPLOAD_MAX_LONG_EDGE
  const quality = opts.quality ?? UPLOAD_JPEG_QUALITY
  const jpeg = await downscaleBlob(blob, maxLongEdge, quality)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return new File([jpeg], `submission-${stamp}.jpg`, { type: "image/jpeg" })
}

// Coarse, non-reversible client fingerprint for rate limiting only — not PII
// and not a tracking id. djb2 over stable browser properties.
export function coarseClientFingerprint(): string {
  const raw = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
  ].join("|")
  let hash = 5381
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 33) ^ raw.charCodeAt(i)
  }
  return `fp-${(hash >>> 0).toString(16)}`
}

// Upload an already-encoded JPEG into `submission-images` under
// pending/<uuid>.jpg (matches the storage insert policy + photo_path regex).
export async function uploadSubmissionImage(
  supabase: SupabaseClient,
  file: Blob
): Promise<{ path: string }> {
  const filename = `${crypto.randomUUID()}.jpg`
  const path = `pending/${filename}`
  const { error } = await supabase.storage
    .from("submission-images")
    .upload(path, file, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    })
  if (error) throw new Error(`Photo upload failed: ${error.message}`)
  return { path }
}