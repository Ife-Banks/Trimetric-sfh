// Saved verified scans — the "Save to My History" store (History tab,
// 52:593 "Product Verified Card" list). Client-side only: there is no
// scan-log table (04_BACKEND_STRUCTURE.md), so history lives in localStorage.
// This is a convenience receipt of scans the user chose to keep, not the
// authoritative dataset — re-scanning still hits the catalogue via the API.

export interface SavedScan {
  id: string
  name: string
  brand: string | null
  imageUrl?: string | null
  category: "gmo_food" | "oral_care"
  resultTier: string
  resultLabel: string
  confidenceTier: "low" | "medium" | "high"
  metric?: string | null
  identityMatch: "barcode" | "name" | "none"
  savedAt: string
}

const KEY = "shf:saved-scans"
const MAX_SCANS = 50

export function saveScan(scan: SavedScan): SavedScan[] {
  const existing = loadScans()
  const next = [scan, ...existing.filter((s) => s.id !== scan.id)].slice(0, MAX_SCANS)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage full/quota — history is a nicety, never a blocker.
  }
  invalidateScansCache()
  return next
}

export function loadScans(): SavedScan[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSavedScan)
  } catch {
    return []
  }
}

export function removeScan(id: string): SavedScan[] {
  const next = loadScans().filter((s) => s.id !== id)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
  invalidateScansCache()
  return next
}

function isSavedScan(value: unknown): value is SavedScan {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    (v.category === "gmo_food" || v.category === "oral_care") &&
    (v.confidenceTier === "low" ||
      v.confidenceTier === "medium" ||
      v.confidenceTier === "high")
  )
}

// --- useSyncExternalStore plumbing -----------------------------------------
//
// The list must be readable during render without setState-in-an-effect (the
// React Compiler lint rule), and it must produce a STABLE snapshot: returning a
// freshly-parsed array on every call would make useSyncExternalStore loop
// forever. Parse once per distinct stored string.

let cachedRaw: string | null = null
let cachedValue: SavedScan[] = []

export function subscribeToScans(onChange: () => void): () => void {
  const handler = () => {
    cachedRaw = null
    onChange()
  }
  window.addEventListener("storage", handler)
  window.addEventListener("focus", handler)
  return () => {
    window.removeEventListener("storage", handler)
    window.removeEventListener("focus", handler)
  }
}

export function getScansSnapshot(): SavedScan[] {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    raw = null
  }
  if (raw === cachedRaw) return cachedValue
  cachedRaw = raw
  if (!raw) {
    cachedValue = []
    return cachedValue
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    cachedValue = Array.isArray(parsed) ? parsed.filter(isSavedScan) : []
  } catch {
    cachedValue = []
  }
  return cachedValue
}

// Server render (and the first client render) has no storage to read. Returning
// the same empty value from both keeps hydration consistent; the store
// re-renders with the real list immediately after mount.
export function getScansServerSnapshot(): SavedScan[] {
  return EMPTY_SCANS
}

const EMPTY_SCANS: SavedScan[] = []

/** Invalidate the cached snapshot after a write. */
export function invalidateScansCache(): void {
  cachedRaw = null
}