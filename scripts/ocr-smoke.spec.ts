// Integration smoke: runs the REAL Tesseract node worker against a committed
// fixture image and feeds its block tree through the exact same pure functions
// the browser worker uses (src/lib/ocr/blocks.ts). Proves the OCR pipeline
// produces sane values (non-empty text, in-range confidence, truncation flag)
// before we ever point a camera at it.
//
// Run via: npm run test:ocr
// Skips (with a message) when fixtures or vendored traineddata are missing.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { summarizeBlocks, type RawBlock } from "../src/lib/ocr/blocks";
import type { TextBox } from "../src/lib/ocr/types";

const require = createRequire(import.meta.url);
const { createWorker } = require("tesseract.js") as typeof import("tesseract.js");

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE = resolve(ROOT, "scripts/fixtures/label-sample.png");
const TESSDATA = resolve(ROOT, "public/vendor/tesseract/tessdata");

function pngDimensions(buf: Buffer): { width: number; height: number } {
  // PNG IHDR: bytes 16..19 = width, 20..23 = height (big-endian).
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

interface TBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Mirrors ocr.worker.ts's toRawBlocks against the node result shape.
function toRawBlocks(blocks: Array<{
  bbox?: TBox;
  confidence?: number;
  text?: string | null;
  paragraphs?: Array<{
    lines?: Array<{ text?: string; confidence?: number; bbox?: TBox }>;
  }>;
} | null>): RawBlock[] {
  return (blocks ?? [])
    .filter((b): b is NonNullable<typeof b> => Boolean(b))
    .map((b) => {
      const box = (bx?: TBox): TextBox | null =>
        bx ? { x0: bx.x0, y0: bx.y0, x1: bx.x1, y1: bx.y1 } : null;
      return {
        box: box(b.bbox),
        confidence: b.confidence ?? 0,
        text: b.text ?? null,
        lines: (b.paragraphs ?? []).flatMap((p) =>
          (p.lines ?? [])
            .map((l) => ({
              text: l.text ?? "",
              box: box(l.bbox),
              confidence: l.confidence ?? 0,
            }))
            .filter((l): l is { text: string; box: TextBox; confidence: number } => l.box !== null)
        ),
      };
    });
}

const ready =
  existsSync(FIXTURE) &&
  existsSync(resolve(TESSDATA, "eng.traineddata.gz"));

describe.skipIf(!ready)("real OCR smoke", () => {
  it("recognizes the fixture label and produces a sane RecognizeResult", async () => {
    const worker = await createWorker("eng", 1, {
      langPath: TESSDATA,
    });
    try {
      const { data } = await worker.recognize(readFileSync(FIXTURE), {}, { text: true, blocks: true });
      const { width, height } = pngDimensions(readFileSync(FIXTURE));

      const raw = toRawBlocks(data.blocks as never);
      const result = summarizeBlocks(raw, { width, height });

      console.log("OCR smoke —— real values");
      console.log("text:", JSON.stringify(result.text));
      console.log("meanConfidence:", result.meanConfidence);
      console.log("isTruncated:", result.isTruncated);
      console.log("blocks:", result.blocks.length);

      expect(result.text.trim().length).toBeGreaterThan(10);
      expect(result.meanConfidence).toBeGreaterThan(0.3);
      expect(result.meanConfidence).toBeLessThanOrEqual(1);
      expect(typeof result.isTruncated).toBe("boolean");
    } finally {
      await worker.terminate();
    }
  });
});