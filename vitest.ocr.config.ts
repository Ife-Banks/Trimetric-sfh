import { defineConfig } from "vitest/config";

// Runs the real OCR stack (scripts/ocr-smoke.spec.ts) against a committed
// fixture label + vendored traineddata. Kept separate from the fast unit
// suite (vitest.config.ts) because it spawns the Tesseract node worker.
export default defineConfig({
  test: {
    include: ["scripts/**/*.spec.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});