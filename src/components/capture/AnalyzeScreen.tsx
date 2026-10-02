"use client"

import Image from "next/image"
import { Check, Circle, Info, Loader2, ScanSearch, Zap } from "lucide-react"
import type { OcrProgress } from "@/lib/ocr/types"
import { cn } from "cn"

// Each line must name the stage that is ACTUALLY running at that index
// (UI_UX_Redesign_Prompt.md: "each line should reflect an actual pipeline
// stage ... not a fake timer"). The real sequence in scan/page.tsx analyze() is:
//   0 downscale  1 front OCR  2 back OCR  3 identifyProduct  4 load config + score
// Stage 1 previously read "Checking the product database" while it was running
// front-label OCR — the catalogue lookup does not happen until stage 3.
const GMO_STEPS = [
  { stage: 0, label: "Preparing product images" },
  { stage: 1, label: "Reading the product name" },
  { stage: 2, label: "Reading the ingredient list" },
  { stage: 3, label: "Checking the product database" },
  { stage: 4, label: "Scoring ingredient signals" },
]

// Includes stage 0 like GMO_STEPS: omitting it meant that while stage 0 was
// active no row was highlighted and every line read "Queued" under a spinning
// ring, i.e. the screen looked stalled during image preparation.
const FLUORIDE_STEPS = [
  { stage: 0, label: "Preparing product images" },
  { stage: 1, label: "Reading product name" },
  { stage: 2, label: "Reading active ingredients" },
  { stage: 3, label: "Checking fluoride levels" },
  { stage: 4, label: "Scoring the result" },
]

export function AnalyzeScreen({
  category,
  stage,
  progress,
}: {
  category: "gmo_food" | "oral_care"
  stage: number
  progress: OcrProgress | null
}) {
  const isOralCare = category === "oral_care"
  const accent = isOralCare ? "text-accent-fluoride" : "text-accent-gmo"
  const accentSurface = isOralCare ? "bg-accent-fluoride-soft" : "bg-accent-gmo-soft"
  const progressValue = (stage === 1 || stage === 2) && progress?.progress != null
    ? Math.min(1, Math.max(0, progress.progress))
    : null
  const percent = progressValue === null ? null : Math.round(progressValue * 100)
  const circumference = 2 * Math.PI * 48
  const ringOffset = progressValue === null ? circumference : circumference * (1 - progressValue)
  const CenterIcon = ScanSearch
  const steps = isOralCare ? FLUORIDE_STEPS : GMO_STEPS

  return (
    <div className={cn("mx-auto flex w-full max-w-[402px] flex-col gap-5 text-ink", isOralCare && "gap-3")}>
      <header className={cn("flex h-10 items-center gap-2 border-b border-surface-hairline", isOralCare && "border-transparent")}>
        <span className="relative size-7 shrink-0 overflow-hidden" aria-hidden="true">
          <Image
            src="/figma/home-logo.png"
            alt=""
            width={70}
            height={74}
            className="absolute -left-[17px] -top-[14px] h-[74px] w-[70px] max-w-none"
            priority
          />
        </span>
          {!isOralCare && <span className="text-[14px] font-semibold">Scan Product</span>}
      </header>

      <section className={cn("flex flex-col items-center pt-2 text-center", isOralCare && "pt-1")} aria-labelledby="analysis-title">
        <div
          className={cn("relative size-32", isOralCare && "size-36")}
          role="progressbar"
          aria-label={percent === null ? "Analysis in progress" : `Label OCR progress ${percent}%`}
          aria-valuemin={percent === null ? undefined : 0}
          aria-valuemax={percent === null ? undefined : 100}
          aria-valuenow={percent ?? undefined}
        >
          <svg viewBox="0 0 112 112" className="size-full -rotate-90" aria-hidden="true">
            <circle cx="56" cy="56" r="48" fill="none" strokeWidth="7" className="stroke-surface-muted" />
            {progressValue !== null ? (
              <circle
                cx="56"
                cy="56"
                r="48"
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                stroke="currentColor"
                className={cn("transition-[stroke-dashoffset] duration-200", accent)}
                strokeDasharray={circumference}
                strokeDashoffset={ringOffset}
              />
            ) : isOralCare ? (
              <circle
                cx="56"
                cy="56"
                r="48"
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                stroke="currentColor"
                className={cn("animate-spin", accent)}
                strokeDasharray={`${circumference * 0.72} ${circumference}`}
              />
            ) : null}
          </svg>
          {isOralCare ? (
            <span className="absolute inset-7 grid place-items-center" aria-hidden="true">
              <svg viewBox="0 0 64 72" className="h-14 w-12 drop-shadow-sm">
                <path d="M32 5c-5-4-14-3-20 2C4 13 5 24 9 36l7 21c2 6 7 7 10 1l4-10c1-3 3-3 4 0l4 10c3 6 8 5 10-1l7-21c4-12 5-23-3-29-6-5-15-6-20-2Z" fill="var(--cyan-wash-3)" stroke="var(--cyan-soft)" strokeWidth="2.5" />
                <path d="M20 17c4-3 9-3 12 0 3-3 8-3 12 0 4 4 3 10 0 16l-7 13-5-8-5 8-7-13c-3-6-4-12 0-16Z" fill="var(--cyan-tint)" opacity=".75" />
                <path d="M24 25c2-2 5-2 7 0m3 0c2-2 5-2 7 0" fill="none" stroke="var(--cyan-hairline)" strokeLinecap="round" strokeWidth="2" />
              </svg>
            </span>
          ) : (
            <span className={cn("absolute inset-5 grid place-items-center rounded-full", accentSurface, accent)} aria-hidden="true">
              <CenterIcon className="size-10" strokeWidth={1.5} />
            </span>
          )}
        </div>

        <span className={cn("mt-3 inline-flex min-h-7 items-center gap-1 rounded-full px-3 text-sm font-bold tabular-nums", isOralCare ? "bg-cyan text-cyan-ink" : `${accentSurface} ${accent}`)} aria-live="polite">
          {percent === null ? <><Loader2 className="size-3.5 animate-spin" /> {isOralCare ? "Scanning" : "In progress"}</> : <>{isOralCare && <Zap className="size-3.5 fill-current" />}{percent}%{!isOralCare && " OCR"}</>}
        </span>
        <h1 id="analysis-title" className="mt-3 text-h2 font-bold tracking-tight">
          {isOralCare ? "Analyzing product…" : "Checking your product…"}
        </h1>
        <p className="mt-1 max-w-xs text-caption leading-relaxed text-muted-foreground">
          {isOralCare
            ? "Reading the label and checking fluoride information against the published ruleset."
            : "Comparing the scanned label with the published GMO ingredient rules. This is an informational screening, not a lab test."}
        </p>
      </section>

      <section className={cn("w-full rounded-2xl border border-cyan-border bg-cyan-wash-2 p-4 shadow-sm", isOralCare && "rounded-[20px] border-cyan-soft-line bg-cyan-wash px-4 py-3.5 shadow-[0_3px_10px_rgba(17,72,93,0.10)]")} aria-labelledby="analysis-checklist-title">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="analysis-checklist-title" className="text-overline uppercase text-ink-muted">Diagnostic checklist</h2>
          <span className={cn("text-[10px] font-semibold", accent)}>{stage === 2 ? progress?.label ?? "Reading label" : "Live status"}</span>
        </div>
        <ol className="space-y-3" aria-label="Scan processing steps">
          {steps.map(({ stage: stepStage, label }) => {
            const complete = stage > stepStage
            const active = stage === stepStage
            return (
              <li key={stepStage} className={cn("flex min-h-6 items-center gap-2.5", !complete && !active && "opacity-55")} aria-current={active ? "step" : undefined}>
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", complete ? "bg-success text-ink-on-brand" : active ? `${accentSurface} ${accent}` : "bg-surface text-muted-foreground")} aria-hidden="true">
                  {complete ? <Check className="size-3" /> : active ? <Loader2 className="size-3 animate-spin" /> : <Circle className="size-2.5" />}
                </span>
                <span className={cn("min-w-0 flex-1 text-caption", active && "font-semibold text-ink", complete && "text-ink-muted")}>{label}</span>
                <span className={cn("shrink-0 text-[10px]", active && isOralCare ? "text-amber" : "text-muted-foreground")}>{complete ? "Done" : active ? (isOralCare ? (percent === null ? "Scanning…" : `${percent}%`) : "In progress") : (isOralCare ? "Queued" : "Waiting")}</span>
              </li>
            )
          })}
        </ol>
      </section>

      {!isOralCare && (
        <aside className="flex items-start gap-2.5 rounded-xl bg-accent-gmo-soft p-3 text-caption leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-accent-gmo" aria-hidden="true" />
          A product photo cannot confirm GMO content. Results are based on recognized label terms and the current published ruleset.
        </aside>
      )}
    </div>
  )
}
