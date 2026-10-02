// @vitest-environment jsdom
//
// Regression guard for the camera viewfinder.
//
// The shipped bug: `startCamera` assigned `videoRef.current.srcObject` while the
// status was still "requesting" — but the <video> is only rendered by the
// "ready" branch, so the ref was null, the assignment was skipped, and the
// viewfinder came up as a black rectangle with a live track behind it. Nothing
// in the suite touched capture, so it went unnoticed until someone used a phone.
//
// This test drives the real entry point (the "Open camera" button) and asserts
// the stream actually reaches the element.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { CameraView } from "@/components/capture/CameraView"

// jsdom implements neither getUserMedia nor a usable play(); the component needs
// both. play() must return a Promise because the attach effect calls .catch().
beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    writable: true,
    value: vi.fn().mockResolvedValue(undefined),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function fakeStream(): MediaStream {
  const track = { stop: vi.fn(), applyConstraints: vi.fn() }
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream
}

function installCamera(stream: MediaStream): void {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  })
}

describe("CameraView", () => {
  it("starts on the placeholder with an Open camera button", () => {
    render(<CameraView facing="front" onCapture={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByText("Camera preview")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Open camera" })).toBeTruthy()
    expect(document.querySelector("video")).toBeNull()
  })

  it("attaches the captured stream to the viewfinder once the video mounts", async () => {
    const stream = fakeStream()
    installCamera(stream)

    render(<CameraView facing="front" onCapture={vi.fn()} onUpload={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Open camera" }))

    await waitFor(() => {
      const video = document.querySelector("video")
      expect(video, "the viewfinder video must mount").toBeTruthy()
      expect(video?.srcObject, "the stream must be attached").toBe(stream)
    })
    // The button flips to capture only once the camera is live.
    expect(screen.getByRole("button", { name: "Take verification photo" })).toBeTruthy()
  })

  it("surfaces a friendly error when the camera is refused", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      },
    })

    render(<CameraView facing="front" onCapture={vi.fn()} onUpload={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Open camera" }))

    await waitFor(() => expect(screen.getByText("Camera permission was denied.")).toBeTruthy())
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })
})
