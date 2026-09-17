"use client";

interface ImagePreviewProps {
  src: string;
  label: string;
  onRetake: () => void;
  onUse?: () => void;
  useLabel?: string;
}

export function ImagePreview({ src, label, onRetake, onUse, useLabel }: ImagePreviewProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
      {/* eslint-disable-next-line @next/next/no-img-element -- object URLs + arbitrary height; next/image adds no benefit here */}
      <img src={src} alt={label} className="max-h-64 w-full object-cover" />
      <div className="flex items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <span className="min-w-0 truncate px-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </span>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onRetake}
            className="h-11 rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Retake
          </button>
          {onUse && (
            <button
              type="button"
              onClick={onUse}
              className="h-11 rounded-full bg-zinc-900 px-4 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {useLabel ?? "Continue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}