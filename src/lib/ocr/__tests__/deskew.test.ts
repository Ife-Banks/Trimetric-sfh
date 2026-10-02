// Skew estimation tests.
//
// The numbers here are not arbitrary: the -20 degree case is the measured failure
// that motivated this module. Rendering the same label at -20 degrees gave the
// real Tesseract stack ZERO characters; at 0 degrees it read 69 characters at 0.9
// confidence with the brand found. So the estimator's only job is to recover that
// angle, and these tests hold it to that.

import { describe, expect, it } from "vitest";

import {
  binarize,
  estimateSkew,
  otsuThreshold,
  profileScore,
  rotateBinary,
} from "../deskew";

/**
 * A grayscale buffer with horizontal text bands, rotated by `deg`.
 * Text bands (not solid blocks) so the projection profile has real structure.
 */
function textImage(width: number, height: number, deg: number): Uint8Array {
  const flat = new Uint8Array(width * height).fill(245);
  // Four text lines of 7px strokes, evenly spaced.
  const lineTops = [0.18, 0.38, 0.58, 0.78].map((f) => Math.round(f * height));
  for (const top of lineTops) {
    for (let y = top; y < top + 7 && y < height; y++) {
      for (let x = Math.round(width * 0.1); x < width * 0.9; x++) {
        // Gaps between "characters" so it is not one solid bar.
        if ((x + top) % 11 < 7) flat[y * width + x] = 30;
      }
    }
  }

  if (deg === 0) return flat;

  // Rotate the grayscale buffer with nearest-neighbour, same convention as
  // rotateBinary so the test measures the estimator, not a sign convention.
  const out = new Uint8Array(flat.length);
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = Math.round(cx + dx * cos + dy * sin);
      const sy = Math.round(cy - dx * sin + dy * cos);
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
      out[y * width + x] = flat[sy * width + sx];
    }
  }
  return out;
}

describe("otsuThreshold", () => {
  it("splits a bimodal image between the two modes", () => {
    const gray = new Uint8Array(200);
    gray.fill(20, 0, 100);
    gray.fill(230, 100, 200);
    const t = otsuThreshold(gray);
    expect(t).toBeGreaterThanOrEqual(20);
    expect(t).toBeLessThan(230);
  });

  it("returns a usable threshold for a flat image without throwing", () => {
    expect(() => otsuThreshold(new Uint8Array(64).fill(128))).not.toThrow();
  });
});

describe("binarize", () => {
  it("marks dark pixels as ink", () => {
    const gray = new Uint8Array([10, 200, 30, 240]);
    expect([...binarize(gray, 128)]).toEqual([255, 0, 255, 0]);
  });
});

describe("profileScore", () => {
  it("scores level text higher than the same text rotated", () => {
    const w = 200;
    const h = 150;
    const level = binarize(textImage(w, h, 0));
    const tilted = binarize(textImage(w, h, 20));
    expect(profileScore(level, w, h)).toBeGreaterThan(profileScore(tilted, w, h));
  });

  it("is zero for an empty buffer", () => {
    expect(profileScore(new Uint8Array(100), 10, 10)).toBe(0);
  });
});

describe("rotateBinary", () => {
  it("is an exact copy at 0 degrees", () => {
    const src = binarize(textImage(60, 40, 0));
    expect([...rotateBinary(src, 60, 40, 0)]).toEqual([...src]);
  });

  it("returns a buffer of the same size", () => {
    const src = binarize(textImage(60, 40, 0));
    expect(rotateBinary(src, 60, 40, 15)).toHaveLength(src.length);
  });
});

describe("estimateSkew", () => {
  const W = 320;
  const H = 240;

  it("reports ~0 for text that is already level", () => {
    const result = estimateSkew(textImage(W, H, 0), W, H);
    expect(result.angle).toBe(0);
  });

  // The measured failure: this is the angle that produced zero characters.
  //
  // SIGN CONVENTION, stated because getting it backwards is the worst possible
  // bug here: it rotates the image the wrong way and makes a bad photo worse.
  // `estimateSkew` returns the rotation that LEVELS the text, which is the
  // opposite of the tilt that produced the image. The caller applies it as-is
  // (prepareBlobForOcr -> rotateImage), so the two cancel by construction.
  it("recovers the correction for the -20 degree tilt that broke OCR", () => {
    const result = estimateSkew(textImage(W, H, -20), W, H);
    expect(result.angle).toBeCloseTo(20, 0);
  });

  it.each([-30, -15, -8, 8, 15, 25])("corrects a %s degree tilt", (deg) => {
    const result = estimateSkew(textImage(W, H, deg), W, H);
    expect(result.angle).toBeCloseTo(-deg, 0);
  });

  it("returns the correction with the opposite sign to the tilt", () => {
    // Asserted directly so a future refactor cannot flip it silently. Getting
    // this wrong would rotate every tilted photo further out of alignment.
    for (const tilt of [-24, -11, 6, 19]) {
      const { angle } = estimateSkew(textImage(W, H, tilt), W, H);
      if (angle !== 0) expect(Math.sign(angle)).toBe(-Math.sign(tilt));
    }
  });

  it("actually improves the profile when its angle is applied", () => {
    const bin = binarize(textImage(W, H, -20));
    const before = profileScore(rotateBinary(bin, W, H, 0), W, H);
    const { angle } = estimateSkew(textImage(W, H, -20), W, H);
    const after = profileScore(rotateBinary(bin, W, H, angle), W, H);
    expect(after).toBeGreaterThan(before);
  });

  it("leaves a small tilt alone rather than adding quantisation noise", () => {
    // Inside the dead zone: rotating a nearly-correct image can only hurt.
    expect(estimateSkew(textImage(W, H, 1), W, H).angle).toBe(0);
  });

  it("is deterministic across repeated calls", () => {
    const gray = textImage(W, H, -17);
    expect(estimateSkew(gray, W, H).angle).toBe(estimateSkew(gray, W, H).angle);
  });

  it("does not throw on a blank buffer", () => {
    const blank = new Uint8Array(W * H).fill(250);
    expect(() => estimateSkew(blank, W, H)).not.toThrow();
  });

  it("searches the full range by default", () => {
    expect(estimateSkew(textImage(W, H, 0), W, H).tested).toBe(81); // -40..40 step 1
  });

  it("honours a narrowed range", () => {
    expect(estimateSkew(textImage(W, H, 0), W, H, { maxAngle: 10 }).tested).toBe(21);
  });
});
