// Barcode decoding (identification tier 1). Pure client-side via ZXing.
// Runs on the captured image, not the live stream, keeping the surface small
// and the decode deterministic. Any failure → null (treated as "no barcode").

import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { readBlobAsImage } from "./image";

// Product barcodes are 1D; restrict hints so we don't burn time on QR/data
// matrix blobs and get a faster, more reliable read.
const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.ITF,
]);
hints.set(DecodeHintType.TRY_HARDER, true);

const reader = new BrowserMultiFormatReader(hints);

/**
 * Decode a single barcode from an image. Returns the raw digits/text or null.
 */
export async function decodeBarcode(image: Blob): Promise<string | null> {
  if (typeof Image === "undefined") return null; // SSR guard
  try {
    const img = await readBlobAsImage(image);
    const result = await reader.decodeFromImageElement(img);
    const text = result?.getText()?.trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null; // NotFoundException, malformed image, etc.
  }
}