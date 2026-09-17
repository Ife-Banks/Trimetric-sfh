import { describe, it, expect } from "vitest"
import { approvePayloadSchema, rejectPayloadSchema, submissionPayloadSchema } from "./schemas"

const validPreview = {
  category: "gmo_food",
  subcategory: "packaged_food",
  result: { tier: "low", label: "Low GMO Likelihood" },
  confidence: { tier: "high", score: 5, factors: ["full list"] },
  matchedTerms: [],
  guidance: "estimates likelihood",
  constraintNotice: "This estimates likelihood from the ingredients listed. It cannot confirm GMO content — only lab testing can.",
  computedAt: "2026-09-16T00:00:00.000Z",
  configVersion: "v1.0",
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    category: "gmo_food",
    subcategory: "packaged_food",
    productName: "Mama Nkechi's Garri",
    brand: "Mama Nkechi",
    barcode: "",
    ingredientsText: "Cassava, water",
    certificationText: "",
    concentrationText: "",
    photoPath: "pending/6f1c0f0e-1234-4abc-9def-000000000000.jpg",
    ocrConfidence: 0.72,
    enginePreview: validPreview,
    fingerprint: "fp-1a2b3c4d",
    ...overrides,
  }
}

describe("submissionPayloadSchema", () => {
  it("accepts a complete, valid submission payload", () => {
    const parsed = submissionPayloadSchema.safeParse(validPayload())
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.productName).toBe("Mama Nkechi's Garri")
      expect(parsed.data.barcode).toBe("")
    }
  })

  it("accepts a barcode of 8–14 digits", () => {
    expect(submissionPayloadSchema.safeParse(validPayload({ barcode: "5449000000996" })).success).toBe(true)
  })

  it("rejects an empty product name", () => {
    const parsed = submissionPayloadSchema.safeParse(validPayload({ productName: "   " }))
    expect(parsed.success).toBe(false)
  })

  it("rejects empty ingredients text", () => {
    const parsed = submissionPayloadSchema.safeParse(validPayload({ ingredientsText: "" }))
    expect(parsed.success).toBe(false)
  })

  it("rejects a non-numeric barcode", () => {
    const parsed = submissionPayloadSchema.safeParse(validPayload({ barcode: "ABC12345" }))
    expect(parsed.success).toBe(false)
  })

  it("rejects a photo path outside the pending/ prefix", () => {
    const parsed = submissionPayloadSchema.safeParse(validPayload({ photoPath: "approved/x.jpg" }))
    expect(parsed.success).toBe(false)
  })

  it("rejects a photo path with path traversal", () => {
    const parsed = submissionPayloadSchema.safeParse(validPayload({ photoPath: "pending/../secret.jpg" }))
    expect(parsed.success).toBe(false)
  })

  it("rejects an out-of-range OCR confidence", () => {
    expect(submissionPayloadSchema.safeParse(validPayload({ ocrConfidence: 1.5 })).success).toBe(false)
    expect(submissionPayloadSchema.safeParse(validPayload({ ocrConfidence: -0.1 })).success).toBe(false)
  })

  it("accepts a null OCR confidence", () => {
    expect(submissionPayloadSchema.safeParse(validPayload({ ocrConfidence: null })).success).toBe(true)
  })

  it("rejects a malformed engine preview", () => {
    const parsed = submissionPayloadSchema.safeParse(
      validPayload({ enginePreview: { category: "gmo_food" } })
    )
    expect(parsed.success).toBe(false)
  })

  it("rejects a missing fingerprint", () => {
    const parsed = submissionPayloadSchema.safeParse(validPayload({ fingerprint: "" }))
    expect(parsed.success).toBe(false)
  })

  it("rejects an unknown category", () => {
    const parsed = submissionPayloadSchema.safeParse(validPayload({ category: "plant_health" }))
    expect(parsed.success).toBe(false)
  })
})

const SUBMISSION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"

function validFinalPayload(overrides: Record<string, unknown> = {}) {
  return {
    barcode: "5449000000996",
    name: "Mama Nkechi's Garri",
    brand: "Mama Nkechi",
    category: "gmo_food",
    subcategory: "packaged_food",
    ingredients_text: "Cassava, water",
    result_tier: "low",
    result_label: "Low GMO Likelihood",
    confidence_tier: "high",
    matched_terms: [
      { term: "corn syrup", normalized: "corn syrup", kind: "explicit", detail: "corn" },
    ],
    guidance_text: "estimates likelihood",
    config_version: "v1.0",
    ...overrides,
  }
}

describe("approvePayloadSchema", () => {
  it("accepts a well-formed approve payload", () => {
    const parsed = approvePayloadSchema.safeParse({
      submissionId: SUBMISSION_ID,
      finalPayload: validFinalPayload(),
    })
    expect(parsed.success).toBe(true)
  })

  it("allows empty optional barcode/brand/guidance and defaults them", () => {
    const parsed = approvePayloadSchema.safeParse({
      submissionId: SUBMISSION_ID,
      finalPayload: validFinalPayload({ barcode: undefined, brand: "", guidance_text: undefined }),
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.finalPayload.barcode).toBe("")
      expect(parsed.data.finalPayload.guidance_text).toBe("")
    }
  })

  it("rejects a non-UUID submission id", () => {
    const parsed = approvePayloadSchema.safeParse({
      submissionId: "not-a-uuid",
      finalPayload: validFinalPayload(),
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects an invalid result tier", () => {
    const parsed = approvePayloadSchema.safeParse({
      submissionId: SUBMISSION_ID,
      finalPayload: validFinalPayload({ result_tier: "extreme" }),
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects an unknown matched-term kind", () => {
    const parsed = approvePayloadSchema.safeParse({
      submissionId: SUBMISSION_ID,
      finalPayload: validFinalPayload({
        matched_terms: [{ term: "x", normalized: "x", kind: "made_up" }],
      }),
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects empty ingredients text", () => {
    const parsed = approvePayloadSchema.safeParse({
      submissionId: SUBMISSION_ID,
      finalPayload: validFinalPayload({ ingredients_text: "" }),
    })
    expect(parsed.success).toBe(false)
  })
})

describe("rejectPayloadSchema", () => {
  it("accepts a bare submission id and defaults the note", () => {
    const parsed = rejectPayloadSchema.safeParse({ submissionId: SUBMISSION_ID })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.reviewNote).toBe("")
  })

  it("rejects a non-UUID submission id", () => {
    const parsed = rejectPayloadSchema.safeParse({ submissionId: "nope" })
    expect(parsed.success).toBe(false)
  })
})