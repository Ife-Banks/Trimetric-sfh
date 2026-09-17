// Product identification — FR-2, three-tier order. Run AFTER capture but the
// tiers decide whether a trusted stored verdict exists:
//
//   Tier 1 (barcode): decode barcode → exact match on products.barcode.
//                     Early-return; tier 2 is never attempted.
//   Tier 2 (name):    no barcode decodable / no barcode match → fuzzy match of
//                     the OCR'd front-label text against products.name via
//                     pg_trgm word-aware scoring (greatest of similarity /
//                     word_similarity / strict_word_similarity), threshold 0.4.
//   Tier 0:           no identity match at all.
//
// Query failures (offline, RPC not deployed yet, etc.) degrade to the next
// tier rather than throwing — the scan always proceeds.

import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeBarcode } from "@/lib/ocr/barcode";

export const NAME_MATCH_THRESHOLD = 0.4; // metric = greatest(similarity, word_similarity, strict_word_similarity); see migration 20260916140000
export const NAME_MATCH_STRONG = 0.8; // strong → high confidence, borderline → medium

export type IdentityMatch = "barcode" | "name" | "none";

export interface ProductRow {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: "gmo_food" | "oral_care";
  subcategory: string;
  ingredients_text: string;
  result_tier: "none" | "low" | "medium" | "high";
  result_label: string;
  confidence_tier: "none" | "low" | "medium" | "high";
  matched_terms: unknown;
  guidance_text: string | null;
  config_version: string;
  similarity?: number; // present on name-match rows (RPC column)
}

export interface IdentificationResult {
  tier: 1 | 2 | 0;
  identityMatch: IdentityMatch;
  barcode?: string;
  product?: ProductRow;
  similarity?: number;
  note?: string;
}

export interface IdentifyArgs {
  frontImage: Blob;
  frontText: string;
  supabase: Pick<SupabaseClient, "from" | "rpc">;
}

function firstMeaningfulLine(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length >= 2);
  return line ?? null;
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Runs tiers 1 → 2 with an early return: a barcode match never falls through
 * to the name query.
 */
export async function identifyProduct(args: IdentifyArgs): Promise<IdentificationResult> {
  // Tier 1 — barcode
  const barcode = await decodeBarcode(args.frontImage);
  if (barcode) {
    const { data } = await args.supabase
      .from("products")
      .select("*")
      .eq("barcode", barcode)
      .maybeSingle();

    if (data) {
      return {
        tier: 1,
        identityMatch: "barcode",
        barcode,
        product: data as ProductRow,
      };
    }
    // Barcode decoded but not in the catalogue → fall through to tier 2.
  }

  // Tier 2 — fuzzy name match on OCR'd front label
  const candidates = [firstMeaningfulLine(args.frontText), compactText(args.frontText)]
    .filter((c): c is string => Boolean(c && c.trim().length >= 3));

  for (const candidate of candidates) {
    const { data, error } = await args.supabase.rpc("search_products_by_name", {
      p_name: candidate,
      p_threshold: NAME_MATCH_THRESHOLD,
    });
    if (error || !Array.isArray(data) || data.length === 0) continue;
    const first = data[0] as ProductRow;
    return {
      tier: 2,
      identityMatch: "name",
      product: first,
      similarity: first.similarity,
      note: "name match via trigram similarity",
    };
  }

  return { tier: 0, identityMatch: "none", note: "no barcode match and no name match" };
}