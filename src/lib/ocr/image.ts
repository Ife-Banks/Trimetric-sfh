// Client-side image helpers: downscale for OCR, capture from a video frame,
// and blob → HTMLImageElement loading for barcode decoding.

const DEFAULT_MAX_LONG_EDGE = 1600; // 03_FRONTEND_ARCHITECTURE.md §6
const DEFAULT_JPEG_QUALITY = 0.85;

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

// Decode → scale to ~1600px long edge → re-encode as JPEG.
// The canvas trip is the same mechanism Phase 4 reuses to strip EXIF before
// upload; here it just normalises the image for OCR.
export async function downscaleBlob(
  blob: Blob,
  maxLongEdge = DEFAULT_MAX_LONG_EDGE,
  quality = DEFAULT_JPEG_QUALITY
): Promise<Blob> {
  const img = await readBlobAsImage(blob);
  const target = computeTargetSize(img.naturalWidth, img.naturalHeight, maxLongEdge);

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, target.width, target.height);

  const out = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!out) throw new Error("Image re-encode failed");
  return out;
}

// Grab the current video frame as a JPEG blob.
export function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const width = video.videoWidth;
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