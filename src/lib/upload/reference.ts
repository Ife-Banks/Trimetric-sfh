// The receipt reference a user sees on the Thanks screen. Derived from the
// storage path ("pending/submission-2026-03-11T10-41-03.123Z.jpg") so the
// human on the user side and the reviewer queue share one token. It is a photo
// reference, not a database row id — submissions have none today (04 §2.3).

export function referenceFromPhotoPath(photoPath: string): string {
  const base = photoPath.split("/").pop() ?? photoPath
  return base.replace(/\.jpe?g$/i, "")
}