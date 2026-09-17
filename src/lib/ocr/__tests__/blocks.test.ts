import { describe, it, expect } from "vitest";
import {
  detectTruncation,
  meanBlockConfidence,
  summarizeBlocks,
  type RawBlock,
} from "../blocks";

const block = (over: Partial<RawBlock> = {}): RawBlock => ({
  box: { x0: 0, y0: 0, x1: 100, y1: 20 },
  confidence: 80,
  lines: [{ text: "corn syrup", box: { x0: 0, y0: 0, x1: 100, y1: 20 } }],
  ...over,
});

describe("meanBlockConfidence", () => {
  it("is the mean of per-block confidences normalised to 0–1", () => {
    const blocks: RawBlock[] = [
      block({ confidence: 100 }),
      block({ confidence: 50 }),
    ];
    expect(meanBlockConfidence(blocks)).toBeCloseTo(0.75);
  });

  it("ignores blocks with no extractable text", () => {
    const blocks: RawBlock[] = [
      block({ confidence: 100 }),
      block({ lines: [], text: "" }),
    ];
    expect(meanBlockConfidence(blocks)).toBeCloseTo(1);
  });

  it("returns 0 for empty input", () => {
    expect(meanBlockConfidence([])).toBe(0);
  });
});

describe("detectTruncation", () => {
  const dims = { width: 1000, height: 2000 };

  it("flags a block running off the bottom edge", () => {
    const blocks: RawBlock[] = [
      block({ box: { x0: 0, y0: 1900, x1: 1000, y1: 2000 } }),
    ];
    expect(detectTruncation(blocks, dims)).toBe(true);
  });

  it("flags a block running off the right edge", () => {
    const blocks: RawBlock[] = [
      block({ box: { x0: 0, y0: 100, x1: 1000, y1: 120 } }),
    ];
    expect(detectTruncation(blocks, dims)).toBe(true);
  });

  it("does not flag text fully inside the frame", () => {
    const blocks: RawBlock[] = [
      block({ box: { x0: 10, y0: 100, x1: 900, y1: 130 } }),
    ];
    expect(detectTruncation(blocks, dims)).toBe(false);
  });

  it("returns false when dimensions are unknown", () => {
    expect(detectTruncation([block()], { width: 0, height: 0 })).toBe(false);
  });
});

describe("summarizeBlocks", () => {
  it("builds text, mean confidence and truncation from raw blocks", () => {
    const blocks: RawBlock[] = [
      block({
        lines: [
          { text: "corn syrup", box: { x0: 0, y0: 0, x1: 400, y1: 20 } },
          { text: "salt", box: { x0: 0, y0: 22, x1: 200, y1: 42 } },
        ],
        confidence: 90,
      }),
      block({
        box: { x0: 0, y0: 1990, x1: 1000, y1: 2000 },
        lines: [{ text: "water", box: { x0: 0, y0: 1990, x1: 300, y1: 2000 } }],
        confidence: 70,
      }),
    ];
    const out = summarizeBlocks(blocks, { width: 1000, height: 2000 });

    expect(out.text).toContain("corn syrup");
    expect(out.text).toContain("salt");
    expect(out.meanConfidence).toBeCloseTo(0.8);
    expect(out.isTruncated).toBe(true);
    expect(out.blocks).toHaveLength(2);
    expect(out.blocks[0].confidence).toBe(90);
  });

  it("handles empty block input", () => {
    const out = summarizeBlocks([], { width: 100, height: 100 });
    expect(out.text).toBe("");
    expect(out.meanConfidence).toBe(0);
    expect(out.isTruncated).toBe(false);
    expect(out.blocks).toEqual([]);
  });
});