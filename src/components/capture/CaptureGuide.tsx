"use client";

import type { FacingMode } from "./CameraView";
import { Badge } from "@/components/ui/badge";

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
          <Badge key={s.key} variant={s.key === step ? "default" : "secondary"}>
            {s.label}
          </Badge>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {STEPS.find((s) => s.key === step)?.detail}
      </p>
    </div>
  );
}