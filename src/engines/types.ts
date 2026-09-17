// Shared engine surface — exact interface from 06_AGENT_CONTEXT.md §5 /
// 01_TECHNICAL_SPECIFICATION.md §5.1. Both gmoEngine and fluorideEngine satisfy
// the `Engine` signature below, so VerdictScreen renders ANY EngineResult.

export interface EngineContext {
  ocrMeanConfidence: number // 0–1, from Tesseract worker
  isTruncated: boolean // OCR flagged the text as cut off
  identityMatch: "barcode" | "name" | "none" // which FR-2 tier resolved
  category: "gmo_food" | "oral_care" // from FR-4 category routing
  subcategory: string // from FR-4 category routing
}

export interface EngineTerm {
  term: string
  normalized: string
  kind: "explicit" | "ambiguous" | "certification" | "active_compound"
  detail?: string
}

export type VerdictTier = "low" | "medium" | "high"
export type ResultTier = VerdictTier | "none"

export interface EngineResult {
  category: "gmo_food" | "oral_care"
  subcategory: string
  result: { tier: ResultTier; label: string }
  confidence: { tier: VerdictTier; score: number; factors: string[] }
  matchedTerms: EngineTerm[]
  guidance: string
  constraintNotice: string
  computedAt: string
  configVersion: string
}

export type Engine = (ingredientsText: string, ctx: EngineContext) => EngineResult