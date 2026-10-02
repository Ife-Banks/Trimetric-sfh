// EXIF orientation handling for browser-decoded images.
//
// WHY THIS EXISTS — measured, not assumed. A phone gallery hands us a JPEG whose
// pixel data is stored in the camera sensor's orientation, with an EXIF
// `Orientation` tag telling a viewer how to rotate/flip it for display. Camera
// *captures* go through a <canvas> and carry no EXIF, but gallery uploads do.
//
// Several Chromium builds — including the embedded browser this app is developed
// against — ignore EXIF when decoding into an <img> or a canvas. The label then
// reaches Tesseract rotated 90°, and comes back as reversed noise at ~0.3
// confidence instead of clean text at ~0.9. That is the "gallery upload is never
// recognised" bug: the capture path is fine because it has no EXIF to lose.
//
// This module reads the tag from the raw bytes and exposes the pure geometry to
// undo it. Detecting whether the browser already applied the tag needs the DOM,
// so it lives in image.ts; everything here is pure and unit-tested.

export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Read the EXIF orientation from the raw bytes of an image (JPEG only).
 *
 * Returns 1 ("normal") for anything else: a non-JPEG, a JPEG with no EXIF, or a
 * malformed EXIF block. Callers treat 1 as "nothing to do".
 */
export function readExifOrientation(bytes: Uint8Array): ExifOrientation {
  // JPEG SOI + marker loop.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;

  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];

    // Standalone markers carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }

    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) break;

    if (marker === 0xe1 && i + 10 <= bytes.length) {
      // APP1 payload must start with the 6-byte "Exif\0\0" identifier.
      const isExif =
        bytes[i + 4] === 0x45 && // E
        bytes[i + 5] === 0x78 && // x
        bytes[i + 6] === 0x69 && // i
        bytes[i + 7] === 0x66 && // f
        bytes[i + 8] === 0x00 &&
        bytes[i + 9] === 0x00;
      if (isExif) {
        const orientation = readOrientationFromTiff(bytes, i + 10, i + 2 + len);
        if (orientation) return orientation;
      }
    }

    // Start-of-scan: everything after this is entropy-coded image data.
    if (marker === 0xda) break;
    i += 2 + len;
  }
  return 1;
}

function readOrientationFromTiff(
  bytes: Uint8Array,
  tiff: number,
  end: number
): ExifOrientation | null {
  if (tiff + 8 > end) return null;
  const littleEndian = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const bigEndian = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
  if (!littleEndian && !bigEndian) return null;

  const u16 = (o: number): number =>
    littleEndian ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1];
  const u32 = (o: number): number =>
    littleEndian
      ? (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0
      : ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;

  // TIFF magic 42, then the offset to IFD0.
  if (u16(tiff + 2) !== 0x002a) return null;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return null;

  const count = u16(ifd);
  // Each IFD entry is 12 bytes; a cap keeps a corrupt count from a long walk.
  const max = Math.min(count, 512);
  for (let k = 0; k < max; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) return null;
    if (u16(entry) === 0x0112) {
      // Orientation is a SHORT: its value sits in the first 2 bytes.
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? (value as ExifOrientation) : null;
    }
  }
  return null;
}

/**
 * The true, un-oriented pixel dimensions stored in a JPEG's Start-Of-Frame
 * segment. Returns null for anything that is not a JPEG.
 *
 * This is how image.ts tells whether a browser applied the EXIF tag: a decode
 * whose dimensions are the stored ones did not rotate, while one that is swapped
 * did. It is deliberately independent of `createImageBitmap`'s
 * `imageOrientation` option, which some builds ignore.
 */
export function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) return null;

    // SOF0..SOF15 carry the frame size; 0xC4 (DHT), 0xC8 (JPG) and 0xCC (DAC)
    // share the range but are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > bytes.length) return null;
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }

    if (marker === 0xda) return null;
    i += 2 + len;
  }
  return null;
}

/** Display dimensions once the orientation is applied. Orientations 5–8 swap. */
export function orientedDimensions(
  width: number,
  height: number,
  orientation: ExifOrientation
): { width: number; height: number } {
  return orientation >= 5 ? { width: height, height: width } : { width, height };
}

/**
 * The affine matrix `[a, b, c, d, e, f]` that maps source pixel space onto the
 * orientation-corrected rectangle — the canonical EXIF transform table. Callers
 * scale it to fit their destination canvas.
 *
 * Orientation 6, for example, returns `[0, 1, -1, 0, height, 0]`, which maps
 * `(x, y) -> (height - y, x)` — a 90° clockwise rotation into a `height × width`
 * rect. That matches the spec: orientation 6 means "rotate 90° CW to display".
 */
export function orientationMatrix(
  orientation: ExifOrientation,
  width: number,
  height: number
): readonly [number, number, number, number, number, number] {
  switch (orientation) {
    case 2:
      return [-1, 0, 0, 1, width, 0];
    case 3:
      return [-1, 0, 0, -1, width, height];
    case 4:
      return [1, 0, 0, -1, 0, height];
    case 5:
      return [0, 1, 1, 0, 0, 0];
    case 6:
      return [0, 1, -1, 0, height, 0];
    case 7:
      return [0, -1, -1, 0, height, width];
    case 8:
      return [0, -1, 1, 0, 0, width];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}
