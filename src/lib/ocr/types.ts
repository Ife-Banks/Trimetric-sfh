// Shared types for the OCR pipeline: worker protocol + recognise output.
// No React, no Supabase — pure browser/worker plumbing.

export interface TextBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TextBlock {
  bbox: TextBox;
  text: string;
  confidence: number; // 0–100, Tesseract per-block
}

export interface RecognizeResult {
  text: string;
  meanConfidence: number; // 0–1, mean of per-block confidences
  isTruncated: boolean; // text-block boundary detection, never string heuristics
  blocks: TextBlock[];
}

export type OcrPhase = "boot" | "recognizing";

export interface OcrProgress {
  phase: OcrPhase;
  label: string;
  progress: number; // 0–1
}

// Worker protocol ---------------------------------------------------------

export interface RecognizeRequest {
  id: string;
  type: "recognize";
  image: Blob;
}

export interface TerminateRequest {
  type: "terminate";
}

export type OcrWorkerRequest = RecognizeRequest | TerminateRequest;

export type OcrWorkerResponse =
  | { id: string; type: "progress"; progress: OcrProgress }
  | { id: string; type: "result"; payload: RecognizeResult }
  | { id: string; type: "error"; message: string }
  | { type: "terminated" };