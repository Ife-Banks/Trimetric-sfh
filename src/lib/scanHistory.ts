// Scan history — writes the "recent checks" receipt that backs the dashboard
// feed for signed-in users.
//
// WHY A SECOND STORE
//   lib/savedScans is a device-local convenience: it only holds scans the user
//   explicitly chose to keep, and only on the device they kept them on. Reading
//   it as "recent checks" meant the dashboard could not see anything the user
//   actually did — and nothing at all on a second device. `submissions` is not a
//   substitute; it records proposed corrections only. So completed scans now go
//   to the `scans` table, keyed to the scanning user.
//
// GUESTS
//   Anonymous scans are never written: there is no owner to scope the row to,
//   and an unowned row would either be world-readable or invisible. Guests keep
//   the on-device store, which is exactly where they are today.
//
// FAILURE POLICY
//   History is a nicety, never a blocker. Every path here swallows its error
//   after logging — a scan that produced a verdict must never be reported as
//   failed because the receipt could not be filed.

import type { EngineResult } from "@/engines/types"
import type { IdentityMatch } from "@/lib/identification/productIdentification"
import { gaugeValue } from "@/components/verdict/gaugeValue"
import { getSupabaseBrowser } from "@/lib/supabase/client"

export interface ScanReceipt {
  /** Catalogue row this matched, when there was one. */
  productId: string | null
  /** Catalogue name, or the best front-label line for a cold scan. */
  productName: string | null
  brand: string | null
  category: "gmo_food" | "oral_care"
  resultTier: string
  resultLabel: string
  confidenceTier: string
  identityMatch: IdentityMatch
  /** The same number the result gauge shows, or null when there is none. */
  metric: string | null
}

/** Builds a receipt from the engine's own output, so it cannot disagree with the verdict. */
export function receiptFrom(args: {
  engineResult: EngineResult
  identityMatch: IdentityMatch
  productId?: string | null
  productName: string | null
  brand: string | null
}): ScanReceipt {
  const { engineResult } = args
  return {
    productId: args.productId ?? null,
    productName: args.productName,
    brand: args.brand,
    category: engineResult.category,
    resultTier: engineResult.result.tier,
    resultLabel: engineResult.result.label,
    confidenceTier: engineResult.confidence.tier,
    identityMatch: args.identityMatch,
    metric: gaugeValue(engineResult)?.number ?? null,
  }
}

export async function recordScan(receipt: ScanReceipt): Promise<void> {
  try {
    const supabase = getSupabaseBrowser()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from("scans").insert({
      scanned_by: user.id,
      product_id: receipt.productId,
      category: receipt.category,
      product_name: receipt.productName,
      brand: receipt.brand,
      result_tier: receipt.resultTier,
      result_label: receipt.resultLabel,
      confidence_tier: receipt.confidenceTier,
      identity_match: receipt.identityMatch,
      metric: receipt.metric,
    })

    if (error) console.warn("[scan] history · could not record this scan:", error.message)
  } catch (error) {
    console.warn(
      "[scan] history · recording failed (the scan itself is unaffected):",
      error instanceof Error ? error.message : error
    )
  }
}
