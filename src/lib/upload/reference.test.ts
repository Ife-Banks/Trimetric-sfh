import { describe, expect, it } from "vitest"
import { referenceFromPhotoPath } from "../../lib/upload/reference"

// The Thanks screen receipt is derived from the storage photo path so the user
// and the reviewer queue share one token (no submission row id is returned
// today). Guard the derivation contract.

describe("referenceFromPhotoPath", () => {
  it("strips the storage prefix and the extension", () => {
    expect(referenceFromPhotoPath("pending/submission-2026-03-11T10-41-03.123Z.jpg")).toBe(
      "submission-2026-03-11T10-41-03.123Z"
    )
  })

  it("handles .jpeg and no extension", () => {
    expect(referenceFromPhotoPath("pending/submission-1.jpeg")).toBe("submission-1")
    expect(referenceFromPhotoPath("submission-2")).toBe("submission-2")
  })
})