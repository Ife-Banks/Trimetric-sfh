import { describe, it, expect } from "vitest";
import {
  identifyProduct,
  isFrontPanelReadable,
  sharesDistinctiveWord,
  NAME_MATCH_THRESHOLD,
  type ProductRow,
} from "../productIdentification";

const product: ProductRow = {
  id: "prod-1",
  barcode: null,
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
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
    }),
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return { data: rows, error: null };
    },
  };
  return { supabase, rpcCalls };
}

describe("identifyProduct — name-only catalogue lookup", () => {
  it("uses the first meaningful front-label line as the name candidate", async () => {
    const { supabase, rpcCalls } = fakeSupabase([{ ...product, similarity: 0.9 }]);
    const result = await identifyProduct({
      frontText: "Corn Chips\nNet wt 200g\nIngredients: corn",
      category: "gmo_food",
      supabase: supabase as never,
    });

    expect(result.tier).toBe(2);
    expect(result.identityMatch).toBe("name");
    expect(result.product?.name).toBe("Corn Chips");
    expect(rpcCalls[0].args).toMatchObject({
      p_name: "Corn Chips",
      p_threshold: NAME_MATCH_THRESHOLD,
      p_category: "gmo_food",
    });
  });

  it("returns no match when the catalogue has no candidate", async () => {
    const { supabase } = fakeSupabase();
    const result = await identifyProduct({ frontText: "Corn Chips", category: "gmo_food", supabase: supabase as never });

    expect(result.tier).toBe(0);
    expect(result.identityMatch).toBe("none");
    expect(result.note).toBe("no product-name match");
  });

  it("skips short OCR noise and searches adjacent front-label lines together", async () => {
    const oralCareProduct: ProductRow = {
      ...product,
      name: "Sensodyne Pronamel Daily Protection",
      brand: "Sensodyne",
      category: "oral_care",
      subcategory: "toothpaste_gel",
      result_label: "Standard Fluoride Content",
    };
    const rpcNames: string[] = [];
    const supabase = {
      rpc: async (_fn: string, args: { p_name: string }) => {
        rpcNames.push(args.p_name);
        return args.p_name === "Sensodyne Pronamel"
          ? { data: [{ ...oralCareProduct, similarity: 0.8 }], error: null }
          : { data: [], error: null };
      },
    };

    const result = await identifyProduct({
      frontText: "rN\nSensodyne\nPronamel\nSpecialist Enamel Protection",
      category: "oral_care",
      supabase: supabase as never,
    });

    expect(rpcNames).toContain("Sensodyne Pronamel");
    expect(rpcNames).not.toContain("rN");
    expect(result.product?.name).toBe("Sensodyne Pronamel Daily Protection");
  });

  it("degrades to no match when the name-search RPC fails", async () => {
    const supabase = {
      rpc: async () => ({ data: null, error: new Error("function does not exist") }),
    } as never;
    const result = await identifyProduct({ frontText: "Corn Chips", category: "gmo_food", supabase });

    expect(result.tier).toBe(0);
  });

  // The recorded attempt is the only way to tell "the RPC is broken" apart from
  // "the catalogue doesn't have it" — they rendered identically before this.
  it("records why each lookup failed, including the RPC error", async () => {
    const supabase = {
      rpc: async () => ({ data: null, error: new Error("function does not exist") }),
    } as never;
    const result = await identifyProduct({ frontText: "Corn Chips", category: "gmo_food", supabase });

    expect(result.attempts).toHaveLength(1);
    expect(result.attempts?.[0]).toMatchObject({
      candidate: "Corn Chips",
      rows: 0,
      error: "function does not exist",
      accepted: false,
    });
  });

  it("records a zero-row lookup as a no-match rather than an error", async () => {
    const { supabase } = fakeSupabase([]);
    const result = await identifyProduct({
      frontText: "Corn Chips",
      category: "gmo_food",
      supabase: supabase as never,
    });

    expect(result.attempts?.[0]).toMatchObject({ rows: 0, error: null, accepted: false });
  });

  it("marks the accepted attempt and stops searching", async () => {
    const { supabase, rpcCalls } = fakeSupabase([{ ...product, similarity: 0.82 }]);
    const result = await identifyProduct({
      frontText: "Corn Chips",
      category: "gmo_food",
      supabase: supabase as never,
    });

    expect(result.identityMatch).toBe("name");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts?.[0]).toMatchObject({ accepted: true, topSimilarity: 0.82 });
    // "Stops searching" is the assertion that matters: each miss costs a network
    // round trip on a phone, so the loop must exit on the first hit.
    expect(rpcCalls).toHaveLength(1);
  });
});

// This predicate decides whether the UI says "we don't have this product in our
// database yet" — a claim that is FALSE when the front photo was never readable.
describe("isFrontPanelReadable", () => {  it("accepts a real front label", () => {
    expect(
      isFrontPanelReadable("SENSODYNE\nPRONAMEL\nGentle Routine Repair\nDAILY SENSITIVITY TOOTHPASTE")
    ).toBe(true);
  });

  it("rejects the noise Tesseract returned for an angled tube photo", () => {
    // Verbatim from a real failing scan: 29 characters, confidence 0.300.
    expect(isFrontPanelReadable('I y=\n"4 A : J\n= <9\n* & ]\nA Ph')).toBe(false);
  });

  it("rejects empty and whitespace-only front panels", () => {
    expect(isFrontPanelReadable("")).toBe(false);
    expect(isFrontPanelReadable("   \n\n  \t ")).toBe(false);
  });

  it("rejects text with no run of three letters", () => {
    expect(isFrontPanelReadable("123 456\n789 012")).toBe(false);
  });

  it("rejects single and double character fragments", () => {
    expect(isFrontPanelReadable("A\nBC\n42")).toBe(false);
  });
});

// The guard against a generic-word-only match returning a stranger's verdict.
// Every rejected case below was measured against the live catalogue and DID match
// before this guard existed.
describe("sharesDistinctiveWord", () => {
  it("rejects a match carried only by a generic product word", () => {
    // 0.688 against "GUM Dental Paste Toothpaste" before the guard.
    expect(sharesDistinctiveWord("Toothpaste 50ml", "GUM Dental Paste Toothpaste")).toBe(false);
  });

  it("rejects a generic query that would match a different product type", () => {
    // 0.481 against a MOUTHWASH before the guard.
    expect(
      sharesDistinctiveWord("Whitening Anticavity Paste", "ACT Restoring Anticavity Fluoride Mouthwash")
    ).toBe(false);
  });

  it("rejects a size or volume as the only shared token", () => {
    expect(sharesDistinctiveWord("50ml", "Close-Up Cinnamon Red Gel Toothpaste 50ml")).toBe(false);
  });

  it("accepts a real brand match", () => {
    expect(sharesDistinctiveWord("COLGATE", "Colgate Kids 2-in-1 Watermelon")).toBe(true);
    expect(sharesDistinctiveWord("Sensodyne", "Sensodyne Pronamel Daily Protection")).toBe(true);
  });

  it("accepts a hyphenated brand", () => {
    // "Oral-B" must survive tokenisation, and "Pro-Expert" is distinctive.
    expect(sharesDistinctiveWord("Oral-B", "Oral-B Pro-Expert All-in-One")).toBe(true);
  });

  it("accepts when only the brand differs but the generic words also appear", () => {
    expect(
      sharesDistinctiveWord("Darlie Double Action Mint", "Darlie Double Action Mint")
    ).toBe(true);
  });

  it("ignores case and punctuation", () => {
    expect(sharesDistinctiveWord("SENSODYNE PRONAMEL!", "Sensodyne Pronamel Daily Protection")).toBe(true);
  });

  it("rejects a fuzzy brand that shares no token at all", () => {
    // The accepted tradeoff: a badly OCR'd brand falls back to the cold-start
    // engine rather than borrowing another product's stored verdict.
    expect(sharesDistinctiveWord("SENSODVNE", "Sensodyne Pronamel Daily Protection")).toBe(false);
  });
});