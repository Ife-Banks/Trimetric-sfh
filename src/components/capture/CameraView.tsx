"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureFrame } from "@/lib/ocr/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";

export type FacingMode = "front" | "back";
type CameraStatus = "idle" | "requesting" | "ready" | "error";

interface CameraViewProps {
  facing: FacingMode;
  onCapture: (blob: Blob) => void;
  onUpload: (file: File) => void;
}

const GUIDANCE: Record<FacingMode, string> = {
  front: "Point at the front label so the product name and brand fill the frame.",
  back: "Point at the ingredients list on the back, edge to edge, well lit.",
};

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera permission was denied.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "The camera is in use by another app.";
    case "SecurityError":
      return "Camera access needs a secure (HTTPS) connection.";
    default:
      return "The camera could not be started.";
  }
}

export function CameraView({ facing, onCapture, onUpload }: CameraViewProps) {
  const [mode, setMode] = useState<FacingMode>(facing);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // SEC-12 / iOS: request the camera only on an explicit user gesture.
  const startCamera = useCallback(
    async (nextMode: FacingMode = mode) => {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setError("This browser does not support camera access. Use the upload fallback.");
        return;
      }
      stopTracks();
      setStatus("requesting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: nextMode === "front" ? "user" : "environment" } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await new Promise<void>((resolve) => {
            const el = videoRef.current;
            if (!el) return resolve();
            if (el.readyState >= 1) return resolve();
            el.addEventListener("loadeddata", () => resolve(), { once: true });
          });
        }
        setStatus("ready");
      } catch (err) {
        setStatus("error");
        setError(cameraErrorMessage(err));
      }
    },
    [mode, stopTracks]
  );

  const switchCamera = useCallback(() => {
    const next = mode === "front" ? "back" : "front";
    setMode(next);
    void startCamera(next);
  }, [mode, startCamera]);

  const capture = useCallback(async () => {
    if (!videoRef.current || status !== "ready") return;
    try {
      const blob = await captureFrame(videoRef.current);
      stopTracks(); // don't leave a live indicator after the shot
      onCapture(blob);
    } catch {
      setError("Could not capture the frame. Try again.");
    }
  }, [status, stopTracks, onCapture]);

  // Stop all media tracks on unmount / flow exit.
  useEffect(() => () => stopTracks(), [stopTracks]);

  return (
    <div className="space-y-4">
      <p className={`text-sm ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
        {error ?? GUIDANCE[mode]}
      </p>

      {status === "idle" && (
        <Card className="gap-3 py-6 text-center">
          <CardContent className="flex flex-col gap-3 px-6">
            <Button type="button" size="lg" onClick={() => void startCamera()}>
              Open camera
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={() => fileRef.current?.click()}>
              Choose from photos
            </Button>
          </CardContent>
        </Card>
      )}

      {status === "requesting" && (
        <div className="flex aspect-[3/4] items-center justify-center rounded-xl border bg-muted text-muted-foreground">
          Starting camera…
        </div>
      )}

      {status === "ready" && (
        <div className="space-y-3">
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${mode === "front" ? "-scale-x-100" : ""}`}
            />
            <div className="pointer-events-none absolute inset-x-5 inset-y-7 rounded-2xl border-2 border-dashed border-white/70" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" size="lg" onClick={() => void capture()}>
              Take photo
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={switchCamera}>
              Switch camera
            </Button>
          </div>
          <Button
            type="button"
            variant="link"
            className="h-auto w-full text-sm underline underline-offset-4"
            onClick={() => fileRef.current?.click()}
          >
            Use a photo from files instead
          </Button>
        </div>
      )}

      {status === "error" && (
        <Card className="gap-3 py-6 text-center">
          <CardContent className="flex flex-col gap-3 px-6">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{error}</p>
              <InlineAlert variant="info">Camera permission is often denied in the browser&apos;s site settings. Check your browser&apos;s permission bar for this site, then try again.</InlineAlert>
            </div>
            <Button type="button" size="lg" onClick={() => void startCamera()}>
              Try again
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={() => fileRef.current?.click()}>
              Choose a photo instead
            </Button>
          </CardContent>
        </Card>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
        }}
      />
    </div>
  );
}