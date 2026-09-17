import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  identifyProduct,
  NAME_MATCH_THRESHOLD,
  type ProductRow,
} from "../productIdentification";
import type { IdentifyArgs } from "../productIdentification";

// Tier 1 (barcode) decoding is stubbed so the identification logic is what's
// under test — the actual ZXing decode is exercised in real-device scans.
vi.mock("@/lib/ocr/barcode", () => ({
  decodeBarcode: vi.fn(),
}));

import { decodeBarcode } from "@/lib/ocr/barcode";

const mockedDecode = vi.mocked(decodeBarcode);

const product: ProductRow = {
  id: "prod-1",
  barcode: "1234567890123",
  name: "Corn Chips",
  brand: "Demo Brand",
  category: "gmo_food",
  subcategory: "packaged_food",
  ingredients_text: "corn, oil, salt",
  result_tier: "high",
  result_label: "High GMO Likelihood",
  confidence_tier: "high",
  matched_terms: [],
  guidance_text: null,
  config_version: "1.0",
};

function fakeSupabase(rows: ProductRow[] = []) {
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return { data: rows, error: null };
    },
  };
  return { supabase, rpcCalls };
}

const blob = new Blob(["irrelevant"]);

describe("identifyProduct — tier 1 barcode", () => {
  beforeEach(() => mockedDecode.mockReset());

  it("returns tier 1 and does NOT run the tier 2 name query when the barcode matches", async () => {
    mockedDecode.mockResolvedValue("1234567890123");
    const rpcCalls: unknown[] = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: product }),
          }),
        }),
      }),
      rpc: async (..._args: unknown[]) => {
        rpcCalls.push(_args);
        throw new Error("tier 2 must not run after a barcode match");
      },
    } as never;

    const result = await identifyProduct({ frontImage: blob, frontText: "Corn Chips", supabase } as unknown as IdentifyArgs);

    expect(result.tier).toBe(1);
    expect(result.identityMatch).toBe("barcode");
    expect(result.barcode).toBe("1234567890123");
    expect(result.product?.name).toBe("Corn Chips");
    expect(rpcCalls).toHaveLength(0);
  });

  it("falls through to tier 2 when the barcode is not in the catalogue", async () => {
    mockedDecode.mockResolvedValue("999999999");
    const { supabase, rpcCalls } = fakeSupabase([{ ...product, similarity: 0.72 }]);

    const result = await identifyProduct({ frontImage: blob, frontText: "Corn Chips", supabase } as unknown as IdentifyArgs);

    expect(result.tier).toBe(2);
    expect(result.identityMatch).toBe("name");
    expect(result.similarity).toBeCloseTo(0.72);
    expect(rpcCalls.map((c) => c.fn)).toEqual(["search_products_by_name"]);
  });
});

describe("identifyProduct — tier 2 name match", () => {
  beforeEach(() => mockedDecode.mockResolvedValue(null));

  it("uses the first meaningful line as the name candidate", async () => {
    const { supabase, rpcCalls } = fakeSupabase([{ ...product, similarity: 0.9 }]);
    const result = await identifyProduct({
      frontImage: blob,
      frontText: "Corn Chips\nNet wt 200g\nIngredients: corn",
      supabase,
    } as unknown as IdentifyArgs);

    expect(result.tier).toBe(2);
    expect(rpcCalls[0].args).toMatchObject({ p_name: "Corn Chips", p_threshold: NAME_MATCH_THRESHOLD });
  });

  it("returns none when no candidate clears the threshold", async () => {
    const { supabase } = fakeSupabase([]);
    const result = await identifyProduct({ frontImage: blob, frontText: "Corn Chips", supabase } as unknown as IdentifyArgs);
    expect(result.tier).toBe(0);
    expect(result.identityMatch).toBe("none");
  });

  it("degrades to none when the RPC errors (offline / migration not applied)", async () => {
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
      rpc: async () => ({ data: null, error: new Error("function does not exist") }),
    } as never;
    const result = await identifyProduct({ frontImage: blob, frontText: "Corn Chips", supabase } as unknown as IdentifyArgs);
    expect(result.tier).toBe(0);
  });
});