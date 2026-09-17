// Pure helpers that turn Tesseract's raw block tree into our trim summary.
// Deliberately DOM-free so they unit-test in plain Node.

import type { RecognizeResult, TextBlock, TextBox } from "./types";

export interface RawLine {
  text: string;
  box: TextBox;
  confidence?: number;
}

export interface RawBlock {
  box: TextBox | null;
  confidence: number;
  text?: string | null;
  lines?: RawLine[];
}

export interface ImageDimensions {
  width: number;
  height: number;
}

// A block is "real" if it has extractable text (via lines or block.text).
export function hasText(block: RawBlock): boolean {
  if (block.lines && block.lines.some((l) => l.text.trim().length > 0)) return true;
  return Boolean(block.text && block.text.trim().length > 0);
}

export function blockText(block: RawBlock): string {
  const lines = (block.lines ?? [])
    .map((l) => l.text.trim())
    .filter((t) => t.length > 0);
  if (lines.length > 0) return lines.join("\n");
  return block.text?.trim() ?? "";
}

export function blocksToText(blocks: RawBlock[]): string {
  return blocks.filter(hasText).map(blockText).filter((t) => t.length > 0).join("\n");
}

// Mean of per-block confidences, normalised to 0–1. Blocks without text are
// ignored (they carry no signal). Empty input yields 0.
export function meanBlockConfidence(blocks: RawBlock[]): number {
  const meaningful = blocks.filter(hasText);
  if (meaningful.length === 0) return 0;
  const total = meaningful.reduce((sum, b) => sum + b.confidence, 0);
  return total / meaningful.length / 100;
}

// Text-boundary detection: a block/line box that runs to the very edge of the
// image means the label was cut off in the frame (e.g. ingredients list
// continuing off the bottom). This is geometry from Tesseract's output — NOT
// a string heuristic like checking for a trailing "…".
const EDGE_FRACTION = 0.005; // 0.5% tolerance for noise

export function detectTruncation(blocks: RawBlock[], dims: ImageDimensions): boolean {
  if (!dims.width || !dims.height) return false;
  const edgeW = dims.width * EDGE_FRACTION;
  const edgeH = dims.height * EDGE_FRACTION;

  const boxes: TextBox[] = blocks.filter(hasText).flatMap((b) => {
    const lineBoxes = (b.lines ?? []).map((l) => l.box).filter((bx): bx is TextBox => Boolean(bx));
    return [b.box, ...lineBoxes].filter((bx): bx is TextBox => Boolean(bx));
  });
  if (boxes.length === 0) return false;

  return boxes.some(
    (box) => box.y1 >= dims.height - edgeH || box.x1 >= dims.width - edgeW
  );
}

// Build the trimmed RecognizeResult from raw Tesseract blocks + image size.
export function summarizeBlocks(
  blocks: RawBlock[],
  dims: ImageDimensions
): RecognizeResult {
  const textBlocks: TextBlock[] = blocks
    .filter(hasText)
    .slice(0, 60) // cap the payload; text flows are what matter
    .map((b) => ({
      bbox: b.box ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
      text: blockText(b),
      confidence: typeof b.confidence === "number" ? b.confidence : 0,
    }));

  return {
    text: blocksToText(blocks),
    meanConfidence: meanBlockConfidence(blocks),
    isTruncated: detectTruncation(blocks, dims),
    blocks: textBlocks,
  };
}