// Skew (deskew) estimation for OCR input.
//
// WHY THIS EXISTS — measured, not assumed. Tesseract's page-segmentation assumes
// roughly level text. Rendering one label at several geometries and running the
// real Tesseract stack over each:
//
//   label at -20 degrees, long edge 1200 ->  0 characters
//   label at -20 degrees, long edge 1600 ->  0 characters
//   label at -20 degrees, long edge 2400 ->  0 characters
//   label at -20 degrees, long edge 3200 ->  0 characters
//   label at -20 degrees, background removed -> 0 characters
//   label at   0 degrees, long edge 2400 -> 69 characters, conf 0.9, brand found
//
// Resolution and background complexity changed NOTHING. The angle was the entire
// problem. A real user photo of a toothpaste tube held diagonally in a hand
// returned 29 characters of pure noise at 0.30 confidence; rotating the label
// level turns the same scene into a clean read.
//
// So the fix is not sharpening, binarising or upscaling — all of which were tried
// and did nothing — it is measuring the tilt and undoing it.
//
// METHOD: horizontal projection profile. Binarise, rotate by a candidate angle,
// sum ink per row, and score the sharpness of that profile. Level text produces
// tall, well-separated peaks; tilted text smears them into a flat blur. The
// winning angle is the skew.
//
// Pure integer maths over a small grayscale buffer, so it is unit-testable with
// no canvas and no DOM.

/** Ink is "on" when the pixel is at least this value (0-255). */
const ON = 255;
const OFF = 0;

/** Longest edge of the buffer the search runs on. Small on purpose: this is a
 *  geometry measurement, not a recognition pass, and 400px is ample. */
export const SKEW_ANALYSIS_MAX_EDGE = 400;

export interface SkewOptions {
  /** Largest |angle| to consider, in degrees. */
  maxAngle?: number;
  /** Step between candidate angles, in degrees. */
  step?: number;
  /** Angles below this are treated as "already level" and not corrected. */
  deadZone?: number;
}

const DEFAULTS: Required<SkewOptions> = { maxAngle: 40, step: 1, deadZone: 1.5 };

/** Otsu's method: the threshold that maximises between-class variance. */
export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let bestVariance = -1;

  for (let t = 0; t < 256; t++) {
    weightBackground += hist[t];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * hist[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
}

/** Binary ink map. Ink is DARK, because text on packaging is dark on light. */
export function binarize(gray: Uint8Array, threshold = otsuThreshold(gray)): Uint8Array {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = gray[i] <= threshold ? ON : OFF;
  return out;
}

/**
 * Rotate a binary buffer by `deg` (clockwise positive) about its centre.
 * Nearest-neighbour: at 400px this is plenty for a profile measurement and keeps
 * the whole search allocation-light.
 */
export function rotateBinary(
  src: Uint8Array,
  width: number,
  height: number,
  deg: number
): Uint8Array {
  const out = new Uint8Array(src.length);
  if (deg === 0) {
    out.set(src);
    return out;
  }

  const radians = (deg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      // Inverse rotation, so we sample the source for each destination pixel.
      const sx = Math.round(cx + dx * cos + dy * sin);
      const sy = Math.round(cy - dx * sin + dy * cos);
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
      out[y * width + x] = src[sy * width + sx];
    }
  }
  return out;
}

/**
 * Sharpness of the horizontal projection profile.
 *
 * Sums ink per row, then scores the total squared step between adjacent rows.
 * Level text gives alternating text/blank bands, so the steps are large. Tilted
 * text overlaps itself row by row and the profile flattens out.
 */
export function profileScore(bin: Uint8Array, width: number, height: number): number {
  const rows = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0;
    const offset = y * width;
    for (let x = 0; x < width; x++) if (bin[offset + x]) count++;
    rows[y] = count;
  }

  let score = 0;
  for (let y = 1; y < height; y++) {
    const delta = rows[y] - rows[y - 1];
    score += delta * delta;
  }
  return score;
}

export interface SkewEstimate {
  /** Signed rotation, in degrees, that would be applied to level the text. */
  angle: number;
  /** Best profile score found. Useful for comparing runs. */
  score: number;
  /** Angles actually tested. */
  tested: number;
}

/**
 * Find the rotation that best levels the text in a grayscale buffer.
 *
 * Returns `angle` such that rotating the image BY `angle` levels the text — the
 * caller applies it, so sign errors surface immediately as a double rotation.
 */
export function estimateSkew(
  gray: Uint8Array,
  width: number,
  height: number,
  options: SkewOptions = {}
): SkewEstimate {
  const { maxAngle, step, deadZone } = { ...DEFAULTS, ...options };
  const bin = binarize(gray);

  let bestAngle = 0;
  let bestScore = -1;
  let tested = 0;

  for (let angle = -maxAngle; angle <= maxAngle + 1e-9; angle += step) {
    // Quantise so repeated calls on the same input agree exactly; without this,
    // floating-point drift makes the test suite flaky.
    const candidate = Math.round(angle * 1000) / 1000;
    const rotated = rotateBinary(bin, width, height, candidate);
    const score = profileScore(rotated, width, height);
    tested++;
    if (score > bestScore) {
      bestScore = score;
      bestAngle = candidate;
    }
  }

  return {
    // Inside the dead zone there is nothing worth correcting, and rotating a
    // correct image by a degree of quantisation error only makes it worse.
    angle: Math.abs(bestAngle) < deadZone ? 0 : bestAngle,
    score: bestScore,
    tested,
  };
}
