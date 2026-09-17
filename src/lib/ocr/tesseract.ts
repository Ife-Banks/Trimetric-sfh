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
  OcrWorkerResponse,
  RecognizeRequest,
  RecognizeResult,
} from "./types";

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

function createWorker(): MinimalWorker {
  if (factory) return factory();
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
      this.#pending.set(id, { resolve, reject, onProgress });
      const req: RecognizeRequest = { id, type: "recognize", image };
      this.#worker.postMessage(req);
    });
  }

  terminate(): void {
    this.#pending.forEach((p) =>
      p.reject(new Error("OCR terminated"))
    );
    this.#pending.clear();
    this.#worker.postMessage({ type: "terminate" });
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