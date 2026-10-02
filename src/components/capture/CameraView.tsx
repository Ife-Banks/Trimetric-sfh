"use client";

// CameraView wraps getUserMedia with a live viewfinder, framing guidance,
// optional torch, gallery upload, and capture. The camera starts only after an
// explicit user gesture; captures and uploads use the same scan pipeline.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppWindow,
  Camera,
  Flashlight,
  FlashlightOff,
  ScanLine,
} from "lucide-react";
import { captureFrame } from "@/lib/ocr/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { cn } from "cn";

export type FacingMode = "front" | "back";
// NOTE: `facing` names which FACE OF THE PACKAGE is being photographed, not
// which camera is selected. The stream is always the rear camera
// (`facingMode: { ideal: "environment" }`), so the preview must never be
// mirrored — mirroring made the step-1 viewfinder show brand logos and product
// names backwards while the user tried to align them in the reticle.
type CameraStatus = "idle" | "requesting" | "ready" | "error";

interface CameraViewProps {
  facing: FacingMode;
  onCapture: (blob: Blob) => void;
  onUpload: (file: File) => void;
}

const GUIDANCE: Record<FacingMode, string> = {
  front: "Front label — name and brand",
  back: "Ingredients — edge to edge",
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

export function CameraView({
  facing,
  onCapture,
  onUpload,
}: CameraViewProps) {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [flashUnsupported, setFlashUnsupported] = useState(false);

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
    async () => {
      setError(null);
      setFlashOn(false);
      setFlashUnsupported(false);
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
          video: { facingMode: { ideal: "environment" } },
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
    [stopTracks]
  );

  const toggleFlash = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // `torch` is not in the DOM typings for MediaTrackConstraintSet even
      // though it is the standard constraint for the mobile flash — cast.
      const constraints: MediaTrackConstraints = {
        advanced: [{ torch: !flashOn }] as unknown as MediaTrackConstraints["advanced"],
      };
      await track.applyConstraints(constraints);
      setFlashOn((on) => !on);
    } catch {
      setFlashUnsupported(true);
    }
  }, [flashOn]);

  const capture = useCallback(async () => {
    if (!videoRef.current || status !== "ready") return;
    try {
      const blob = await captureFrame(videoRef.current);
      stopTracks();
      // The stream is gone, so the live viewfinder is a black rectangle from
      // here on. Return to the startable state so the next label has a working
      // camera instead of a dead one — the scan flow reuses this component for
      // both the front and back label. This does NOT auto-open the camera:
      // getUserMedia still needs an explicit user gesture (SEC-12 / iOS).
      setStatus("idle");
      setFlashOn(false);
      setFlashUnsupported(false);
      onCapture(blob);
    } catch {
      setStatus("error");
      setError("Could not capture the frame. Try again.");
    }
  }, [status, stopTracks, onCapture]);

  useEffect(() => () => stopTracks(), [stopTracks]);

  const reticleCorners = "absolute size-8 rounded-[3px] border-accent-fluoride shadow-[0_0_12px_rgba(45,212,191,0.45)]";
  const Flash = flashOn ? Flashlight : FlashlightOff;

  return (
    <div className="space-y-4">
      {status === "idle" && (
        <div className="flex h-[350px] flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-border bg-surface-muted px-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-surface text-primary shadow-sm">
            <Camera className="size-7" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-foreground">Camera preview</p>
          <p className="max-w-[260px] text-sm leading-5 text-muted-foreground">
            Start the camera to frame the {facing === "front" ? "product name and brand" : "ingredients and nutrition label"}.
          </p>
        </div>
      )}

      {status === "requesting" && (
        <div className="flex h-[350px] items-center justify-center rounded-[16px] bg-ink text-sm text-white/70">
          Starting camera…
        </div>
      )}

      {status === "ready" && (
        <div className="relative aspect-[1.03] overflow-hidden rounded-[16px] bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />

          {/* Darkened vignette & AR calibration scrim */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_45%,rgba(0,0,0,0.55)_100%)]" />

          {/* HUD central bounding frame — cyan/teal reticle corners */}
          <div className="pointer-events-none absolute inset-x-6 inset-y-9">
            <span className={cn(reticleCorners, "left-0 top-0 border-l-2 border-t-2")} />
            <span className={cn(reticleCorners, "right-0 top-0 border-r-2 border-t-2 rounded-tr-none")} />
            <span className={cn(reticleCorners, "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-none")} />
            <span className={cn(reticleCorners, "bottom-0 right-0 border-b-2 border-r-2 rounded-br-none")} />

            {/* On-frame guidance pill */}
            <div className="absolute inset-x-0 bottom-3 flex justify-center">
              <span className="inline-flex max-w-[85%] items-center gap-1.5 truncate rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                <ScanLine className="size-3.5 text-accent-fluoride" aria-hidden="true" />
                {GUIDANCE[facing]}
              </span>
            </div>
          </div>

          {/* Flash toggle — top-right, inside the viewfinder */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-pressed={flashOn}
            aria-label={flashOn ? "Flash on" : "Flash off"}
            disabled={flashUnsupported}
            title={flashUnsupported ? "Flash isn't supported on this device" : "Toggle flash"}
            onClick={() => void toggleFlash()}
            className="absolute right-3 top-3 size-11 rounded-full bg-black/45 text-white hover:bg-black/65 hover:text-white size-11"
          >
            <Flash className="size-4" aria-hidden="true" />
          </Button>
          {flashUnsupported && (
            <span className="pointer-events-none absolute right-3 top-12 rounded px-2 py-0.5 text-[10px] text-white/60">
              Flash not supported
            </span>
          )}
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

      <div className="flex items-center justify-between gap-2 px-1">
        <Button
          type="button"
          variant="ghost"
          className="h-[64px] flex-1 flex-col gap-1 rounded-xl text-ink-muted hover:bg-transparent hover:text-ink-secondary"
          onClick={() => fileRef.current?.click()}
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-tinted text-ink-muted"><AppWindow className="size-4" aria-hidden="true" /></span>
          <span className="text-[10px] font-medium">Gallery</span>
        </Button>

        <div className="flex flex-[2] flex-col items-center">
          <Button
            type="button"
            size="icon"
            aria-label={status === "ready" ? "Take verification photo" : "Open camera"}
            disabled={status === "requesting"}
            onClick={() => void (status === "ready" ? capture() : startCamera())}
            className="grid size-[52px] place-items-center rounded-[18px] bg-emerald text-white shadow-[0_3px_8px_rgba(5,90,65,0.22)] hover:bg-emerald/90"
          >
            <Camera className="size-6" aria-hidden="true" />
          </Button>
          <span className="mt-1 text-[10px] font-medium text-ink-muted">
            {status === "ready" ? "Capture" : "Open camera"}
          </span>
        </div>

        <div className="flex-1" aria-hidden="true" />
      </div>

      <input
        ref={fileRef}
        type="file"
        // Restrict to formats the browser can actually decode. `image/*` happily
        // offers HEIC (the iPhone default), which Chrome and every non-Safari
        // engine fail to decode — the upload then dies with "couldn't read that
        // photo" and no product. Naming the JPEG/PNG/WebP types also makes iOS
        // transcode a picked HEIC to JPEG for us instead of handing over the raw
        // file.
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so picking the same file again (after a retake) still fires.
          e.target.value = "";
          if (file) onUpload(file);
        }}
      />
    </div>
  );
}
