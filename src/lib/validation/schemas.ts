// Shared Zod schemas for server-accepted payloads (04_BACKEND_STRUCTURE.md
// §2.4: every server-accepted payload is validated). Used by the client form
// and by /api/submissions — one source of truth, compiled out of any type
// errors because the payload maps 1:1 to the `submissions` table.

import { z } from "zod"

const photoPathPattern = /^pending\/[a-z0-9-]+\.(jpe?g|png)$/i

// The engine preview is the full EngineResult at submission time, stored as
// jsonb for the Phase 5 admin live-recompute. Validate the envelope and the
// fields that matter for review, not the whole surface — fluorideEngine in
// Phase 6 keeps the exact same EngineResult shape.
const enginePreviewSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => {
    const result = v.result as Record<string, unknown> | undefined
    const confidence = v.confidence as Record<string, unknown> | undefined
    return (
      typeof v.category === "string" &&
      typeof result?.tier === "string" &&
      typeof confidence?.tier === "string" &&
      typeof v.configVersion === "string" &&
      typeof v.constraintNotice === "string"
    )
  }, "enginePreview is not a valid engine result")

export const submissionPayloadSchema = z.object({
  category: z.enum(["gmo_food", "oral_care"]),
  subcategory: z.string().max(120).optional().default(""),
  productName: z.string().trim().min(1, "Product name is required").max(200),
  brand: z.string().trim().max(200).optional().default(""),
  barcode: z
    .union([z.literal(""), z.string().trim().regex(/^[0-9]{8,14}$/, "barcode must be 8–14 digits")])
    .optional()
    .default(""),
  ingredientsText: z.string().trim().min(1, "Ingredients text is required").max(12000),
  certificationText: z.string().trim().max(200).optional().default(""),
  concentrationText: z.string().trim().max(200).optional().default(""),
  photoPath: z.string().regex(photoPathPattern, "Invalid photo path"),
  ocrConfidence: z.number().min(0).max(1).nullish().default(null),
  enginePreview: enginePreviewSchema,
  fingerprint: z.string().min(8, "Client fingerprint is too short").max(120),
})

export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>

// Rate limiting per 04_BACKEND_STRUCTURE.md §2.3: per-IP (5/hour) with a coarse
// client fingerprint as secondary key, plus a hard cap on pending submissions.
export const SUBMISSION_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  max: 5,
  maxPendingPerFingerprint: 3,
} as const

// ---------------------------------------------------------------------------
// Admin review — approve / reject (04_BACKEND_STRUCTURE.md §3–4, SEC-10).
// `finalPayload` maps 1:1 to the keys approve_submission() reads; the verdict
// fields always come from a server-side recompute, never admin free text.
// ---------------------------------------------------------------------------

const engineTermSchema = z.object({
  term: z.string().min(1).max(200),
  normalized: z.string().max(200),
  kind: z.enum(["explicit", "ambiguous", "certification", "active_compound"]),
  detail: z.string().max(400).optional(),
})

export const finalPayloadSchema = z.object({
  barcode: z.string().trim().max(32).optional().default(""),
  name: z.string().trim().min(1, "Name is required").max(200),
  brand: z.string().trim().max(200).optional().default(""),
  category: z.enum(["gmo_food", "oral_care"]),
  subcategory: z.string().trim().min(1, "Subcategory is required").max(120),
  ingredients_text: z.string().trim().min(1, "Ingredients text is required").max(12000),
  result_tier: z.enum(["none", "low", "medium", "high"]),
  result_label: z.string().trim().min(1).max(120),
  confidence_tier: z.enum(["none", "low", "medium", "high"]),
  matched_terms: z.array(engineTermSchema).max(200),
  guidance_text: z.string().trim().max(2000).optional().default(""),
  config_version: z.string().trim().min(1).max(50),
})

export const approvePayloadSchema = z.object({
  submissionId: z.string().uuid(),
  finalPayload: finalPayloadSchema,
})

export const rejectPayloadSchema = z.object({
  submissionId: z.string().uuid(),
  reviewNote: z.string().trim().max(2000).optional().default(""),
})

export type FinalPayload = z.infer<typeof finalPayloadSchema>
export type ApprovePayload = z.infer<typeof approvePayloadSchema>
export type RejectPayload = z.infer<typeof rejectPayloadSchema>