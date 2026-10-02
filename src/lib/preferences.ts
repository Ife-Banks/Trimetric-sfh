// Persistent client preferences — small, honest knobs that shape the capture
// flow (Figma 127:265 "Diagnostic Preferences"). Today: the default scan
// category used by /scan when no ?category routing param is present. Stored in
// localStorage; never sent anywhere.

export type DefaultCategory = "gmo" | "fluoride"

const KEY = "shf:preferences"

export function readDefaultCategory(): DefaultCategory {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return "gmo"
    const parsed = JSON.parse(raw) as { defaultCategory?: unknown }
    return parsed.defaultCategory === "fluoride" ? "fluoride" : "gmo"
  } catch {
    return "gmo"
  }
}

export function writeDefaultCategory(value: DefaultCategory): void {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>
    window.localStorage.setItem(KEY, JSON.stringify({ ...parsed, defaultCategory: value }))
  } catch {
    // ignore
  }
  invalidatePreferencesCache()
}

// --- useSyncExternalStore plumbing -----------------------------------------
//
// The value must be readable during render without setState-in-an-effect, and
// the snapshot must be referentially stable or useSyncExternalStore loops.

let cachedRaw: string | null = null
let cachedValue: DefaultCategory = "gmo"

function invalidatePreferencesCache(): void {
  cachedRaw = null
}

export function subscribeToPreferences(onChange: () => void): () => void {
  const handler = () => {
    invalidatePreferencesCache()
    onChange()
  }
  window.addEventListener("storage", handler)
  return () => window.removeEventListener("storage", handler)
}

export function getDefaultCategorySnapshot(): DefaultCategory {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    raw = null
  }
  if (raw === cachedRaw) return cachedValue
  cachedRaw = raw
  cachedValue = "gmo"
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { defaultCategory?: unknown }
      cachedValue = parsed.defaultCategory === "fluoride" ? "fluoride" : "gmo"
    } catch {
      cachedValue = "gmo"
    }
  }
  return cachedValue
}

// Server render has no storage. Both snapshots agree on the default so the
// first client render matches the server markup exactly.
export function getDefaultCategoryServerSnapshot(): DefaultCategory {
  return "gmo"
}