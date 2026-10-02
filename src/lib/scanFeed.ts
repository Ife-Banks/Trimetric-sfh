import type { SupabaseClient } from "@supabase/supabase-js"
import type { SavedScan } from "@/lib/savedScans"
import { scanActivity, type ScanActivity } from "@/lib/scanActivity"

// The dashboard feed has two sources and one shape.
//
//   signed in → the `scans` table (this file), so the feed shows what the user
//               actually scanned, on any device
//   guest     → lib/savedScans, the on-device store, which is all a user with no
//               account has
//
// Both are mapped to FeedScan so the card component renders one thing and cannot
// accidentally treat them differently.

/** How many rows the dashboard feed renders. Lives here, not in the component,
 * so the server can use the same number without importing a client module. */
export const FEED_LIMIT = 3

export interface FeedScan {
  id: string
  name: string
  brand: string | null
  imageUrl: string | null
  category: "gmo_food" | "oral_care"
  resultTier: string
  resultLabel: string
  confidenceTier: "low" | "medium" | "high"
  metric: string | null
  identityMatch: "barcode" | "name" | "none"
  /** When the scan happened. */
  at: string
}

export function feedScanFromSaved(scan: SavedScan): FeedScan {
  return {
    id: scan.id,
    name: scan.name,
    brand: scan.brand ?? null,
    imageUrl: scan.imageUrl ?? null,
    category: scan.category,
    resultTier: scan.resultTier,
    resultLabel: scan.resultLabel,
    confidenceTier: scan.confidenceTier,
    metric: scan.metric ?? null,
    identityMatch: scan.identityMatch,
    at: scan.savedAt,
  }
}

interface ScanRow {
  id: string
  product_name: string | null
  brand: string | null
  category: "gmo_food" | "oral_care"
  result_tier: string
  result_label: string
  confidence_tier: "low" | "medium" | "high"
  metric: string | null
  identity_match: "barcode" | "name" | "none"
  created_at: string
}

/**
 * The signed-in user's scan count and streak for the hub's shield card.
 *
 * Returns null when the query fails, so the card falls back to a neutral line
 * rather than telling the user they have scanned nothing — "you have no scans"
 * and "we could not read your scans" are different statements.
 *
 * Bounded to the 500 most recent scans. That is roughly 1.4 scans a day for a
 * year, so it only truncates for an extreme user, and truncation can only ever
 * UNDERSTATE the streak — the one direction that is safe.
 */
export async function loadScanActivity(
  supabase: Pick<SupabaseClient, "from">
): Promise<ScanActivity | null> {
  const { data, error } = await supabase
    .from("scans")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) return null
  return scanActivity(((data ?? []) as { created_at: string }[]).map((row) => row.created_at))
}

const SCAN_COLUMNS =
  "id, product_name, brand, category, result_tier, result_label, confidence_tier, metric, identity_match, created_at"

/**
 * The signed-in user's most recent scans, plus the true total for "View All (n)".
 *
 * Returns null when the query fails, so the caller can fall back to the device
 * store rather than showing an empty feed — "you have no scans" and "we could not
 * read your scans" are different statements and only one of them is true.
 *
 * RLS scopes this to the caller (scans_read_own); no user filter is needed here
 * and adding one would only mask a policy regression.
 */
export async function loadAccountScans(
  supabase: Pick<SupabaseClient, "from">,
  limit: number
): Promise<{ rows: FeedScan[]; total: number } | null> {
  const [rowsResult, countResult] = await Promise.all([
    supabase
      .from("scans")
      .select(SCAN_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("scans").select("id", { count: "exact", head: true }),
  ])

  if (rowsResult.error || countResult.error) return null

  const rows = ((rowsResult.data ?? []) as ScanRow[]).map((row) => ({
    id: row.id,
    // A cold scan that matched nothing has no name; say so instead of inventing
    // one from the OCR text that failed to match.
    name: row.product_name?.trim() || "Unidentified product",
    brand: row.brand,
    // Receipts deliberately carry no image (see the scans migration), so the card
    // falls back to its category glyph.
    imageUrl: null,
    category: row.category,
    resultTier: row.result_tier,
    resultLabel: row.result_label,
    confidenceTier: row.confidence_tier,
    metric: row.metric,
    identityMatch: row.identity_match,
    at: row.created_at,
  }))

  return { rows, total: countResult.count ?? rows.length }
}
