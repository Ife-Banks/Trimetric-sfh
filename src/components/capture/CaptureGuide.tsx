"use client";

import type { FacingMode } from "./CameraView";

interface CaptureGuideProps {
  step: FacingMode;
}

const STEPS: Array<{ key: FacingMode; label: string; detail: string }> = [
  {
    key: "front",
    label: "1 · Front label",
    detail: "Product name and brand — used to identify the product.",
  },
  {
    key: "back",
    label: "2 · Ingredients",
    detail: "The ingredients list on the back — used for the verdict.",
  },
];

export function CaptureGuide({ step }: CaptureGuideProps) {
  return (
    <div className="mb-4">
      <div className="flex gap-2">
        {STEPS.map((s) => (
          <span
            key={s.key}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              s.key === step
                ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {s.label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        {STEPS.find((s) => s.key === step)?.detail}
      </p>
    </div>
  );
}