// Client-side image helpers: downscale for OCR, capture from a video frame,
// and blob → HTMLImageElement loading for barcode decoding.

import { estimateSkew, SKEW_ANALYSIS_MAX_EDGE } from "./deskew";
import {
  orientationMatrix,
  orientedDimensions,
  readExifOrientation,
  readJpegDimensions,
  type ExifOrientation,
} from "./exif";

const DEFAULT_MAX_LONG_EDGE = 1600; // 03_FRONTEND_ARCHITECTURE.md §6
const DEFAULT_JPEG_QUALITY = 0.85;
/** How far into a file we look for an EXIF block / JPEG frame header. */
const HEADER_SCAN_BYTES = 256 * 1024;

export interface TargetSize {
  width: number;
  height: number;
}

// Pure geometry: never upscales, caps the long edge, preserves aspect ratio.
export function computeTargetSize(
  width: number,
  height: number,
  maxLongEdge = DEFAULT_MAX_LONG_EDGE
): TargetSize {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge || longEdge === 0) return { width, height };
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function readBlobAsImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

/**
 * An image decoded with the orientation it should be DISPLAYED at.
 *
 * `source` is the raw `<img>` decode; `width`/`height` are the display size and
 * `orientation` is the EXIF rotation still to apply (1 when none is needed —
 * either the file carries no tag or the browser already honoured it).
 */
export interface DecodedImage {
  source: HTMLImageElement;
  width: number;
  height: number;
  orientation: ExifOrientation;
}

/**
 * Decode a blob and work out whether we still need to apply its EXIF orientation.
 *
 * Gallery photos (unlike canvas captures) can carry an EXIF `Orientation` tag.
 * Current browsers apply it while decoding, in which case there is nothing to do.
 * But some builds — webviews, older engines — ignore it, and then the label
 * reaches OCR rotated 90° and reads as reversed noise at ~0.3 confidence. That
 * is the class of "gallery upload is never recognised" failure.
 *
 * So when a tag is present we check whether the decode already reflects it (see
 * {@link orientationAlreadyApplied}) and only apply the rotation ourselves if it
 * does not. The header is read lazily and only the leading bytes are inspected.
 */
export async function decodeImage(blob: Blob): Promise<DecodedImage> {
  let source: HTMLImageElement;
  try {
    source = await readBlobAsImage(blob);
  } catch {
    // A HEIC photo, a corrupt file, or a format this engine lacks. The raw
    // browser message ("Could not decode image") is shown to the user verbatim
    // by the scan flow, so make it say what to do instead.
    throw new Error(
      "That photo's format can't be read here. Choose a JPEG or PNG, or retake it with the camera."
    );
  }
  const naturalWidth = source.naturalWidth || source.width;
  const naturalHeight = source.naturalHeight || source.height;

  // Only the first slice can hold the EXIF block and the SOF frame header, so we
  // never copy a whole multi-megabyte photo onto the main thread just to read a
  // few bytes. 256 KB comfortably covers EXIF blocks with a large thumbnail.
  let bytes: Uint8Array | null = null;
  try {
    bytes = new Uint8Array(await blob.slice(0, HEADER_SCAN_BYTES).arrayBuffer());
  } catch {
    bytes = null;
  }

  const orientation: ExifOrientation = bytes ? readExifOrientation(bytes) : 1;
  if (orientation === 1) {
    return { source, width: naturalWidth, height: naturalHeight, orientation: 1 };
  }

  const stored = bytes ? readJpegDimensions(bytes) : null;
  if (orientationAlreadyApplied(source, orientation, stored)) {
    return { source, width: naturalWidth, height: naturalHeight, orientation: 1 };
  }

  const dims = orientedDimensions(naturalWidth, naturalHeight, orientation);
  return { source, width: dims.width, height: dims.height, orientation };
}

/**
 * Did the browser already rotate the decoded image for us?
 *
 * Getting this wrong is worse than the original bug: applying the tag on top of a
 * browser that already applied it double-rotates every gallery photo.
 * `createImageBitmap(blob, { imageOrientation: "none" })` would be the tidy way
 * to peek at the raw pixels, but some builds (including the embedded browser this
 * app is developed against) ignore that option and hand back an oriented bitmap.
 *
 * So instead we compare the decode against the true stored frame size from the
 * JPEG header: orientations 5–8 swap the axes, so a decode that is swapped
 * relative to the stored frame was rotated by the browser and needs no help.
 * Orientations 2–4 keep the dimensions and cannot be told apart this way, so we
 * assume the browser handled them — true for every current mainstream browser.
 */
function orientationAlreadyApplied(
  img: HTMLImageElement,
  orientation: ExifOrientation,
  stored: { width: number; height: number } | null
): boolean {
  if (orientation <= 4 || !stored) return true;
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  return imgW === stored.height && imgH === stored.width;
}

/**
 * Draw a {@link DecodedImage} into `ctx`, scaled to fill `destWidth × destHeight`,
 * applying its EXIF orientation. `ctx` is left with an identity transform.
 */
export function drawOriented(
  ctx: CanvasRenderingContext2D,
  image: DecodedImage,
  destWidth: number,
  destHeight: number
): void {
  const { source, orientation } = image;
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  if (!sw || !sh) return;

  const oriented = orientedDimensions(sw, sh, orientation);
  const sx = oriented.width ? destWidth / oriented.width : 1;
  const sy = oriented.height ? destHeight / oriented.height : 1;
  const [a, b, c, d, e, f] = orientationMatrix(orientation, sw, sh);
  // Scale ∘ orientation: the matrix maps source space into the oriented rect,
  // and the scalar scales that rect onto the destination.
  ctx.setTransform(sx * a, sy * b, sx * c, sy * d, sx * e, sy * f);
  ctx.drawImage(source, 0, 0, sw, sh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Decode → scale to ~1600px long edge → re-encode as JPEG.
//
// The canvas trip both bakes the EXIF orientation (so a photo that was stored
// sideways is written upright) and strips the EXIF block — the same mechanism
// Phase 4 reuses for submission evidence. Honouring the orientation here is not
// an optional cosmetic step: re-encoding *without* it is what makes a gallery
// photo appear rotated and read as noise.
export async function downscaleBlob(
  blob: Blob,
  maxLongEdge = DEFAULT_MAX_LONG_EDGE,
  quality = DEFAULT_JPEG_QUALITY
): Promise<Blob> {
  const decoded = await decodeImage(blob);
  const target = computeTargetSize(decoded.width, decoded.height, maxLongEdge);

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  drawOriented(ctx, decoded, target.width, target.height);

  const out = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!out) throw new Error("Image re-encode failed");
  return out;
}

/**
 * Prepare a capture for OCR: downscale, then level any tilt.
 *
 * Deliberately NOT folded into `downscaleBlob`. That function also produces the
 * submission evidence photo (`lib/upload/uploadImage.ts`), and the evidence must
 * stay as the user shot it — silently rotating someone's photo before it is
 * attached to a moderation decision is not a transformation to make quietly.
 * (Note that `downscaleBlob` DOES apply the EXIF orientation. That is not the
 * same thing: it restores the photo to how the user saw and shot it, rather than
 * inventing a new angle. Skipping it is what left gallery photos sideways.)
 *
 * Tilt is corrected here because it is the one thing that reliably destroys OCR:
 * measured against the real Tesseract stack, the same label read 0 characters at
 * -20 degrees and 69 characters at 0 degrees, with resolution and background
 * complexity making no difference at all. See `deskew.ts`.
 */
export async function prepareBlobForOcr(
  blob: Blob,
  maxLongEdge = DEFAULT_MAX_LONG_EDGE,
  quality = DEFAULT_JPEG_QUALITY
): Promise<{ blob: Blob; skewAngle: number }> {
  const scaled = await downscaleBlob(blob, maxLongEdge, quality);
  const img = await readBlobAsImage(scaled);
  const skewAngle = await measureSkew(img);
  if (skewAngle === 0) return { blob: scaled, skewAngle };

  const rotated = rotateImage(img, skewAngle);
  const out = await encodeJpeg(rotated, quality);
  return { blob: out ?? scaled, skewAngle };
}

/**
 * Measure the tilt of already-decoded image content.
 *
 * Runs the search on a small grayscale buffer: the measurement is about geometry,
 * so 400px is ample and keeps this well under a frame budget on a phone.
 */
async function measureSkew(img: HTMLImageElement): Promise<number> {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) return 0;

  const scale = Math.min(1, SKEW_ANALYSIS_MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;
  ctx.drawImage(img, 0, 0, w, h);

  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    // A tainted canvas cannot be read. Only reachable if the source blob came
    // from a cross-origin origin, which our own object URLs never are — but a
    // silent "no deskew" is better than a failed scan.
    return 0;
  }

  const gray = new Uint8Array(w * h);
  const px = data.data;
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    gray[p] = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) | 0;
  }
  return estimateSkew(gray, w, h).angle;
}

/** Rotate about the centre, sized to contain the whole original (no crop). */
function rotateImage(img: HTMLImageElement, deg: number): HTMLCanvasElement {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const radians = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  // Bounding box of the rotated rectangle.
  const outW = Math.ceil(width * cos + height * sin);
  const outH = Math.ceil(width * sin + height * cos);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(radians);
  // White, not transparent: Tesseract treats transparency as unpredictable ink.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.drawImage(img, -width / 2, -height / 2);
  return canvas;
}

async function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

// Grab the current video frame as a JPEG blob.
export function captureFrame(video: HTMLVideoElement): Promise<Blob> {  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width === 0 || height === 0) return Promise.reject(new Error("No video frame available"));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas 2D context unavailable"));
  ctx.drawImage(video, 0, 0, width, height);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Frame re-encode failed"))),
      "image/jpeg",
      0.9
    )
  );
}

// A small JPEG data URL, for anything that must survive a page reload.
//
// Object URLs (`blob:...`) are scoped to the document that created them. They
// die on reload, and they are also explicitly revoked when the scan flow
// resets — so persisting one into localStorage produced a permanently broken
// <img> on every saved-scan card, which failed silently because those images
// are decorative (alt=""). A data URL is self-contained; at 160px it is a few
// KB, well inside the localStorage budget for the 50-entry cap.
export async function toThumbnailDataUrl(
  blob: Blob,
  maxLongEdge = 160,
  quality = 0.7
): Promise<string> {
  const decoded = await decodeImage(blob);
  const target = computeTargetSize(decoded.width, decoded.height, maxLongEdge);

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  drawOriented(ctx, decoded, target.width, target.height);

  return canvas.toDataURL("image/jpeg", quality);
}
