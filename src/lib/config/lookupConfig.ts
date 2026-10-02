import type gmoConfigSource from "../../../data/gmo_lookup_config_v1.0.json"
import type fluorideConfigSource from "../../../data/fluoride_lookup_config_v1.3.json"
import type { SupabaseClient } from "@supabase/supabase-js"

export type GmoLookupConfig = typeof gmoConfigSource
export type FluorideLookupConfig = typeof fluorideConfigSource
export type LookupConfig = GmoLookupConfig | FluorideLookupConfig
export type LookupCategory = "gmo_food" | "oral_care"

interface CachedConfig {
  key: LookupCategory
  version: string
  config: LookupConfig
  fetchedAt: number
}

const DATABASE_NAME = "shf-lookup-config"
const STORE_NAME = "configs"
const CACHE_MAX_AGE = 5 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function validateLookupConfig(category: LookupCategory, value: unknown): LookupConfig | null {
  if (!isRecord(value) || typeof value.version !== "string" || !value.version.trim()) return null

  if (category === "gmo_food") {
    const explicit = value.explicit_crop_matches
    const ambiguous = value.ambiguous_derivative_matches
    if (
      !isRecord(value.certification_short_circuit) ||
      !Array.isArray(value.certification_short_circuit.terms) ||
      !isRecord(explicit) ||
      !Array.isArray(explicit.entries) ||
      !isRecord(ambiguous) ||
      !Array.isArray(ambiguous.entries) ||
      !Array.isArray(value.low_risk_tokens)
    ) return null

    const validExplicit = explicit.entries.every((entry) =>
      isRecord(entry) && typeof entry.crop_family === "string" &&
      Array.isArray(entry.aliases) && entry.aliases.every((alias) => typeof alias === "string")
    )
    const validAmbiguous = ambiguous.entries.every((entry) =>
      isRecord(entry) && typeof entry.ingredient === "string"
    )
    const validCerts = value.certification_short_circuit.terms.every((term) => typeof term === "string")
    const validLowRisk = value.low_risk_tokens.every((term) => typeof term === "string")
    return validExplicit && validAmbiguous && validCerts && validLowRisk ? value as GmoLookupConfig : null
  }

  const tables = value.category_ppm_tables
  if (
    !Array.isArray(value.terms_lookup_table) ||
    !isRecord(value.subcategory_detection) ||
    !isRecord(tables) ||
    !Object.values(tables).every((table) => Array.isArray(table))
  ) return null

  const validTerms = value.terms_lookup_table.every((term) => {
    if (!isRecord(term) || typeof term.term_id !== "string" ||
      typeof term.raw_term !== "string" || typeof term.normalized_term !== "string" ||
      typeof term.regex_pattern !== "string" || term.regex_pattern.length > 500) return false
    try {
      new RegExp(term.regex_pattern, "i")
      return true
    } catch {
      return false
    }
  })
  const validRows = Object.values(tables).every((table) =>
    Array.isArray(table) && table.every((row) =>
      isRecord(row) && Array.isArray(row.ppm_range) &&
      row.ppm_range.length === 2 && row.ppm_range.every((bound) => typeof bound === "number") &&
      typeof row.verdict === "string"
    )
  )
  return validTerms && validRows ? value as FluorideLookupConfig : null
}

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readCached(category: LookupCategory): Promise<CachedConfig | null> {
  try {
    const db = await openCache()
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(category)
      request.onsuccess = () => resolve((request.result as CachedConfig | undefined) ?? null)
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

async function writeCached(entry: CachedConfig): Promise<void> {
  try {
    const db = await openCache()
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(entry)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch {
    // IndexedDB is an optimization; the network response remains usable.
  }
}

export async function loadLookupConfig(
  supabase: Pick<SupabaseClient, "from">,
  category: LookupCategory
): Promise<LookupConfig> {
  const cached = await readCached(category)
  if (cached && Date.now() - cached.fetchedAt < CACHE_MAX_AGE) {
    const validCached = validateLookupConfig(category, cached.config)
    if (validCached && validCached.version === cached.version) return validCached
  }

  try {
    const config = await fetchPublishedLookupConfig(supabase, category)
    await writeCached({ key: category, version: config.version, config, fetchedAt: Date.now() })
    return config
  } catch (error) {
    const validCached = cached && validateLookupConfig(category, cached.config)
    if (validCached && validCached.version === cached.version) return validCached
    throw error
  }
}

export async function fetchPublishedLookupConfig(
  supabase: Pick<SupabaseClient, "from">,
  category: LookupCategory
): Promise<LookupConfig> {
  const { data, error } = await supabase
    .from("lookup_config")
    .select("version, config_json")
    .eq("category", category)
    .eq("is_published", true)
    .maybeSingle()

  if (error) throw new Error("Could not load the published ruleset.")
  if (data) {
    const config = validateLookupConfig(category, data.config_json)
    if (config && config.version === data.version) return config
  }
  throw new Error(
    `No valid published ${category === "gmo_food" ? "GMO" : "oral-care"} ruleset is available.`
  )
}
