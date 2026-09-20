"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ImagePreviewProps {
  src: string;
  label: string;
  onRetake: () => void;
  onUse?: () => void;
  useLabel?: string;
}

export function ImagePreview({ src, label, onRetake, onUse, useLabel }: ImagePreviewProps) {
  return (
    <Card className="gap-0 overflow-hidden rounded-xl py-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- object URLs + arbitrary height; next/image adds no benefit here */}
      <img src={src} alt={label} className="max-h-64 w-full object-cover" />
      <CardContent className="flex items-center justify-between gap-2 border-t bg-muted/50 px-3 py-3">
        <span className="min-w-0 truncate px-1 text-sm font-medium">{label}</span>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={onRetake}>
            Retake
          </Button>
          {onUse && (
            <Button type="button" onClick={onUse}>
              {useLabel ?? "Continue"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}