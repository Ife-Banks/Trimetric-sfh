// Main-thread facade over the OCR worker. The worker owns the actual
// Tesseract.js lifecycle; this module is a typed request/response envelope
// that streams progress back and surfaces results via Promises.
//
// Lazy: the worker is only instantiated on the first `recognize()` call,
// which happens when the user taps "Read labels". Language data is downloaded
// on-demand by Tesseract and is NOT in the initial bundle (see
// 03_FRONTEND_ARCHITECTURE.md §6 and AGENTS.md OCR section).

import type {
  OcrProgress,
  OcrWorkerRequest,
  OcrWorkerResponse,
  RecognizeRequest,
  RecognizeResult,
} from "./types";

// Upper bound on a single recognition. Tesseract on a ~1600px label normally
// finishes in 1–3s on a mid-range phone; 45s is far past any legitimate run
// and only trips on a stall. Tuned well above the <8s scan-to-verdict target
// (01_TECHNICAL_SPECIFICATION.md §4) so a slow device is never cut off.
const OCR_TIMEOUT_MS = 45_000;

export interface MinimalWorker {
  postMessage(msg: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  terminate(): void;
}

export type WorkerFactory = () => MinimalWorker;

interface Pending {
  resolve: (r: RecognizeResult) => void;
  reject: (e: Error) => void;
  onProgress?: (p: OcrProgress) => void;
}

let factory: WorkerFactory | null = null;

export function setWorkerFactory(f: WorkerFactory): void {
  factory = f;
}

/**
 * Test seam, honoured ONLY outside production.
 *
 * Real Tesseract in a browser worker is slow, needs ~10 MB of traineddata, and
 * returns non-deterministic text — none of which is acceptable in an end-to-end
 * test that has to assert an exact verdict. `setWorkerFactory` is the intended
 * injection point and was already exported; this lets a Playwright init script
 * install a deterministic stub from outside the bundle.
 *
 * Production builds ignore it entirely, so this cannot be used to fake a verdict
 * against the real app.
 */
declare global {
  interface Window {
    __SHF_OCR_WORKER_FACTORY__?: WorkerFactory;
  }
}

function createWorker(): MinimalWorker {
  if (factory) return factory();
  if (
    process.env.NODE_ENV !== "production" &&
    typeof window !== "undefined" &&
    typeof window.__SHF_OCR_WORKER_FACTORY__ === "function"
  ) {
    return window.__SHF_OCR_WORKER_FACTORY__();
  }
  // The real Worker's onmessage is typed for `MessageEvent`; our MinimalWorker
  // is a structural subset. Casting is safe — the runtime shape matches.
  return new Worker(new URL("./ocr.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as MinimalWorker;
}

export class OcrClient {
  #worker: MinimalWorker;
  #pending = new Map<string, Pending>();
  #seq = 0;

  constructor() {
    this.#worker = createWorker();
    this.#worker.onmessage = (ev) => this.#handle(ev.data as OcrWorkerResponse);
  }

  #handle(msg: OcrWorkerResponse): void {
    if (msg.type !== "progress" && msg.type !== "result" && msg.type !== "error") return;
    if (msg.type === "progress") {
      // Progress is id-scoped but sent to the latest recognize call for now.
      const id = (msg as { id: string }).id;
      const p = this.#pending.get(id);
      if (p?.onProgress) p.onProgress(msg.progress);
      return;
    }
    const id = (msg as { id: string }).id;
    const p = this.#pending.get(id);
    if (!p) return;
    this.#pending.delete(id);
    if (msg.type === "result") p.resolve(msg.payload);
    else p.reject(new Error(msg.message));
  }

  recognize(
    image: Blob,
    onProgress?: (p: OcrProgress) => void
  ): Promise<RecognizeResult> {
    const id = String(++this.#seq);
    return new Promise<RecognizeResult>((resolve, reject) => {
      // Timeout guard — 06_AGENT_CONTEXT.md §7: "Add a timeout guard — abort and
      // return low confidence rather than hanging on a pathological pattern."
      // Without this, a pathological image (or a stalled WASM core) leaves the
      // returned promise unsettled forever and the scan screen spins on
      // "analyzing" with no error and no way out.
      const timer = setTimeout(() => {
        if (!this.#pending.has(id)) return;
        this.#pending.delete(id);
        // Stop the in-flight recognition. The worker is left alive: it will
        // settle its own message when it finishes, which #handle discards
        // because the id is no longer pending.
        try {
          this.#worker.postMessage({ id, type: "abort" } satisfies OcrWorkerRequest);
        } catch {
          /* worker already gone */
        }
        reject(
          new Error(
            "Text recognition took too long and was stopped. Try again with the label flatter and better lit."
          )
        );
      }, OCR_TIMEOUT_MS);

      this.#pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
        onProgress,
      });
      const req: RecognizeRequest = { id, type: "recognize", image };
      this.#worker.postMessage(req);
    });
  }

  terminate(): void {
    this.#pending.forEach((p) =>
      p.reject(new Error("OCR terminated"))
    );
    this.#pending.clear();
    // Let the worker shut Tesseract down gracefully first. Killing the worker
    // synchronously meant the terminate message was never processed and the
    // worker's own cleanup could not run.
    try {
      this.#worker.postMessage({ type: "terminate" } satisfies OcrWorkerRequest);
    } catch {
      /* already gone */
    }
    this.#worker.terminate();
  }
}

let instance: OcrClient | null = null;

export function getOcrClient(): OcrClient {
  if (typeof window === "undefined") {
    throw new Error("OCR requires a browser; getOcrClient must run client-side");
  }
  if (!instance) instance = new OcrClient();
  return instance;
}

export function terminateOcr(): void {
  instance?.terminate();
  instance = null;
}