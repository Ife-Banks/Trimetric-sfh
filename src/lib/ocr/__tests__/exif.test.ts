// EXIF orientation parsing + geometry tests.
//
// The 0.32-confidence, reversed-text OCR failure on gallery uploads traced to the
// browser ignoring the EXIF `Orientation` tag, so these tests pin the parser and
// the transform table that undo it. A wrong matrix here rotates every gallery
// photo further out of alignment instead of fixing it.

import { describe, expect, it } from "vitest";

import {
  orientationMatrix,
  orientedDimensions,
  readExifOrientation,
  readJpegDimensions,
  type ExifOrientation,
} from "../exif";

/** Minimal JPEG with an SOF0 frame header carrying width/height. */
function jpegWithDimensions(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00, // one component
    0xff, 0xda, 0x00, 0x02, // SOS
    0xff, 0xd9, // EOI
  ]);
}

/**
 * Minimal big-endian JPEG carrying only an APP1 EXIF block with `orientation`.
 * Ends at Start-Of-Scan, which is all the parser walks.
 */
function jpegWithOrientation(orientation: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe1, 0x00, 0x22, // APP1, length 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF, IFD0 @8
    0x00, 0x01, // one IFD entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // next IFD: none
    0xff, 0xda, 0x00, 0x02, // SOS
    0xff, 0xd9, // EOI
  ]);
}

describe("readExifOrientation", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("reads orientation %s", (o) => {
    expect(readExifOrientation(jpegWithOrientation(o))).toBe(o);
  });

  it("returns 1 for a non-JPEG blob", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(readExifOrientation(png)).toBe(1);
  });

  it("returns 1 for a JPEG with no EXIF block", () => {
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    expect(readExifOrientation(bare)).toBe(1);
  });

  it("returns 1 rather than throwing on truncated bytes", () => {
    const full = jpegWithOrientation(6);
    expect(readExifOrientation(full.subarray(0, 8))).toBe(1);
    expect(readExifOrientation(full.subarray(0, 20))).toBe(1);
  });

  it("ignores an out-of-range orientation value", () => {
    expect(readExifOrientation(jpegWithOrientation(9))).toBe(1);
  });
});

describe("readJpegDimensions", () => {
  it("reads the stored frame size", () => {
    expect(readJpegDimensions(jpegWithDimensions(1486, 668))).toEqual({ width: 1486, height: 668 });
  });

  it("returns null for a non-JPEG", () => {
    expect(readJpegDimensions(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });

  it("returns null when the frame header is absent", () => {
    expect(readJpegDimensions(jpegWithOrientation(6))).toBeNull();
  });
});

describe("orientedDimensions", () => {
  it("swaps width and height for orientations 5-8", () => {
    for (const o of [5, 6, 7, 8] as ExifOrientation[]) {
      expect(orientedDimensions(4000, 3000, o)).toEqual({ width: 3000, height: 4000 });
    }
  });

  it("keeps the dimensions for orientations 1-4", () => {
    for (const o of [1, 2, 3, 4] as ExifOrientation[]) {
      expect(orientedDimensions(4000, 3000, o)).toEqual({ width: 4000, height: 3000 });
    }
  });
});

describe("orientationMatrix", () => {
  const apply = (
    m: readonly [number, number, number, number, number, number],
    x: number,
    y: number
  ): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  it("is the identity for orientation 1", () => {
    expect(orientationMatrix(1, 10, 5)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  // Orientation 6 = "rotate 90° clockwise to display". The top-left pixel of a
  // 10x5 source must land at the top-right of the swapped 5x10 display.
  it("rotates 90° clockwise for orientation 6", () => {
    const m = orientationMatrix(6, 10, 5);
    expect(apply(m, 0, 0)).toEqual([5, 0]);
    expect(apply(m, 10, 0)).toEqual([5, 10]);
    expect(apply(m, 0, 5)).toEqual([0, 0]);
    expect(apply(m, 10, 5)).toEqual([0, 10]);
  });

  it("rotates 90° counter-clockwise for orientation 8", () => {
    const m = orientationMatrix(8, 10, 5);
    expect(apply(m, 0, 0)).toEqual([0, 10]);
    expect(apply(m, 10, 0)).toEqual([0, 0]);
    expect(apply(m, 0, 5)).toEqual([5, 10]);
  });

  it("rotates 180° for orientation 3", () => {
    const m = orientationMatrix(3, 10, 5);
    expect(apply(m, 0, 0)).toEqual([10, 5]);
    expect(apply(m, 10, 5)).toEqual([0, 0]);
  });

  it("mirrors horizontally for orientation 2", () => {
    const m = orientationMatrix(2, 10, 5);
    expect(apply(m, 0, 0)).toEqual([10, 0]);
    expect(apply(m, 10, 5)).toEqual([0, 5]);
  });
});
