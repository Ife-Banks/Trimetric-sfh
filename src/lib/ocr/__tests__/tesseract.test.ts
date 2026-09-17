import { describe, it, expect, beforeEach } from "vitest";
import { OcrClient, setWorkerFactory, type MinimalWorker } from "../tesseract";
import type { OcrWorkerResponse, RecognizeRequest } from "../types";

function makeFakeWorker(): MinimalWorker & { sent: unknown[] } {
  const worker = {
    sent: [] as unknown[],
    postMessage(msg: unknown) {
      worker.sent.push(msg);
      return undefined;
    },
    onmessage: null as unknown as MinimalWorker["onmessage"],
    terminate() {},
  };
  return worker;
}

describe("OcrClient", () => {
  let worker: ReturnType<typeof makeFakeWorker>;

  beforeEach(() => {
    worker = makeFakeWorker();
    setWorkerFactory(() => worker);
  });

  function send(msg: OcrWorkerResponse) {
    worker.onmessage?.({ data: msg });
  }

  function lastRequest(): RecognizeRequest {
    return worker.sent[worker.sent.length - 1] as RecognizeRequest;
  }

  it("posts a recognize request with a unique id and the image blob", () => {
    const client = new OcrClient();
    const blob = new Blob(["x"]);
    void client.recognize(blob);

    const req = lastRequest();
    expect(req.type).toBe("recognize");
    expect(req.id).toBe("1");
    expect(req.image).toBe(blob);
  });

  it("resolves with the RecognizeResult and streams progress", async () => {
    const client = new OcrClient();
    const progress: string[] = [];
    const promise = client.recognize(new Blob(["x"]), (p) => progress.push(p.label));

    send({ id: lastRequest().id, type: "progress", progress: { phase: "boot", label: "Loading…", progress: 0.4 } });
    const result = { text: "corn syrup", meanConfidence: 0.9, isTruncated: false, blocks: [] };
    send({ id: lastRequest().id, type: "result", payload: result });

    await expect(promise).resolves.toEqual(result);
    expect(progress).toEqual(["Loading…"]);
  });

  it("rejects on an error message", async () => {
    const client = new OcrClient();
    const promise = client.recognize(new Blob(["x"]));
    send({ id: lastRequest().id, type: "error", message: "traineddata 404" });

    await expect(promise).rejects.toThrow("traineddata 404");
  });

  it("ignores messages for unknown ids", async () => {
    const client = new OcrClient();
    const promise = client.recognize(new Blob(["x"]));
    send({ id: "999", type: "result", payload: { text: "", meanConfidence: 0, isTruncated: false, blocks: [] } });

    await expect(Promise.race([promise, Promise.resolve("pending")])).resolves.toBe("pending");
  });

  it("terminates the worker and rejects in-flight requests", async () => {
    const client = new OcrClient();
    const promise = client.recognize(new Blob(["x"]));
    client.terminate();

    await expect(promise).rejects.toThrow("OCR terminated");
    expect(worker.sent).toContainEqual({ type: "terminate" });
  });
});