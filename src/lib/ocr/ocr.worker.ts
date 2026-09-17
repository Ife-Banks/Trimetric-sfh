// Dedicated module worker for OCR. Tesseract.js runs HERE — never on the
// main thread, or the UI freezes for seconds and reads as a crash.
//
// The worker owns a single Tesseract worker, reused across scans, and streams
// real progress to the caller. Assets are self-hosted under /vendor/tesseract
// (set up by `npm run ocr:assets`) so nothing hits a third-party origin.

import { createWorker, type WorkerOptions } from "tesseract.js";
import { summarizeBlocks, type RawBlock } from "./blocks";
import type {
  OcrProgress,
  OcrWorkerRequest,
  OcrWorkerResponse,
} from "./types";

// Minimal worker-global typing — avoids pulling lib.webworker into the
// program and colliding with the `dom` lib that tsconfig already includes.
const ctx = globalThis as unknown as {
  postMessage: (msg: OcrWorkerResponse) => void;
  onmessage: ((ev: MessageEvent) => void) | null;
  close: () => void;
};

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;

const WORKER_PATH = "/vendor/tesseract/worker.min.js";
const CORE_PATH = "/vendor/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js";
const LANG_PATH = "/vendor/tesseract/tessdata/";

let tesseract: TesseractWorker | null = null;
let booting: Promise<TesseractWorker> | null = null;
let progressSink: ((p: OcrProgress) => void) | null = null;

function forwardProgress(status: string, mProgress: number): void {
  if (!progressSink) return;
  let progress: OcrProgress;
  if (status === "recognizing text") {
    progress = {
      phase: "recognizing",
      label: "Reading text…",
      progress: 0.5 + mProgress * 0.5,
    };
  } else if (status.includes("traineddata")) {
    progress = { phase: "boot", label: "Loading language pack…", progress: 0.25 + mProgress * 0.2 };
  } else if (status.includes("core")) {
    progress = { phase: "boot", label: "Loading OCR engine…", progress: 0 + mProgress * 0.2 };
  } else {
    progress = { phase: "boot", label: "Preparing OCR…", progress: 0.45 + mProgress * 0.05 };
  }
  progressSink(progress);
}

async function getTesseract(): Promise<TesseractWorker> {
  if (tesseract) return tesseract;
  if (!booting) {
    const options: Partial<WorkerOptions> = {
      workerPath: WORKER_PATH,
      corePath: CORE_PATH,
      langPath: LANG_PATH,
      gzip: true,
      logger: (m: { status?: string; progress?: number }) =>
        forwardProgress(m.status ?? "", m.progress ?? 0),
    };
    booting = createWorker("eng", 1, options);
  }
  tesseract = await booting;
  return tesseract;
}

// Map Tesseract's block tree into our minimal RawBlock shape.
function toRawBlocks(data: {
  blocks?: Array<{
    bbox?: { x0: number; y0: number; x1: number; y1: number };
    confidence?: number;
    text?: string | null;
    paragraphs?: Array<{
      lines?: Array<{
        text?: string;
        confidence?: number;
        bbox?: { x0: number; y0: number; x1: number; y1: number };
      }>;
    }>;
  }> | null;
}): RawBlock[] {
  return (data.blocks ?? []).map((b) => ({
    box: b.bbox
      ? { x0: b.bbox.x0, y0: b.bbox.y0, x1: b.bbox.x1, y1: b.bbox.y1 }
      : null,
    confidence: typeof b.confidence === "number" ? b.confidence : 0,
    text: b.text ?? null,
    lines: (b.paragraphs ?? [])
      .flatMap((p) => p.lines ?? [])
      .map((l) => ({
        text: l.text ?? "",
        confidence: typeof l.confidence === "number" ? l.confidence : 0,
        box: l.bbox
          ? { x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1 }
          : { x0: 0, y0: 0, x1: 0, y1: 0 },
      })),
  }));
}

async function recognizing(image: Blob) {
  const worker = await getTesseract();
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });

  const bitmap = await createImageBitmap(image);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();

  return summarizeBlocks(toRawBlocks(data), dims);
}

async function handle(msg: OcrWorkerRequest): Promise<void> {
  if (msg.type === "terminate") {
    try {
      await tesseract?.terminate();
    } catch {
      // already gone — fine
    }
    tesseract = null;
    booting = null;
    ctx.postMessage({ type: "terminated" });
    ctx.close();
    return;
  }

  if (msg.type === "recognize") {
    progressSink = (p) => ctx.postMessage({ id: msg.id, type: "progress", progress: p });
    try {
      const payload = await recognizing(msg.image);
      progressSink = null;
      ctx.postMessage({ id: msg.id, type: "result", payload });
    } catch (err) {
      progressSink = null;
      const message = err instanceof Error ? err.message : String(err);
      ctx.postMessage({ id: msg.id, type: "error", message });
    }
  }
}

ctx.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as OcrWorkerRequest;
  // Fire-and-forget; results/progress flow back via postMessage.
  void handle(msg).catch((err: unknown) => {
    // Unexpected failure outside the per-request try/catch. Errors are still
    // delivered via the id-scoped path above; fall back to the console here.
    console.error("[ocr.worker] unhandled", err);
    if (msg.type === "recognize") {
      ctx.postMessage({ id: msg.id, type: "error", message: String(err) });
    }
  });
};