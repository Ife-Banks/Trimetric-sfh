import { describe, it, expect } from "vitest";
import { computeTargetSize } from "../image";

describe("computeTargetSize", () => {
  it("caps the long edge at 1600 and preserves aspect ratio", () => {
    const out = computeTargetSize(4000, 3000);
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
  });

  it("does not upscale smaller images", () => {
    expect(computeTargetSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(computeTargetSize(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it("handles portrait orientation", () => {
    const out = computeTargetSize(1000, 5000);
    expect(out.width).toBe(320);
    expect(out.height).toBe(1600);
  });

  it("handles degenerate zero dimensions without dividing by zero", () => {
    expect(computeTargetSize(0, 0)).toEqual({ width: 0, height: 0 });
  });

  it("rounds to whole pixels and never goes below 1px", () => {
    const out = computeTargetSize(101, 2000);
    expect(Number.isInteger(out.width)).toBe(true);
    expect(out.width).toBeGreaterThanOrEqual(1);
    expect(out.height).toBe(1600);
  });
});