"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/ui/panel"
import { cn } from "cn"

// The three-slide carousel shown before /register. MUTAGENIC is the umbrella
// brand, so this screen — the only one that runs before a flow has been chosen
// — speaks in the umbrella accent (--accent-mutagenic), never in the GMO green
// or the fluoride blue. Those two belong to the category cards on the hub.
//
// Why this file is laid out the way it is:
//
// The previous version positioned each slide's parts with per-slide absolute
// offsets (`top-[289px]`, `top-[452px]`, `top-[597px]`) that were pixel
// transcriptions of an 874pt Figma frame. Those numbers only held at exactly
// 874pt tall: on a shorter phone the artwork overlapped the copy and the Skip
// control fell below the fold, and nothing could reflow because every position
// was a magic number.
//
// This version is one scroll region above one pinned footer. Measured at
// 402x874, the tallest slide (2 — its two diagnostic cards are the deepest
// proof block) needs about 55px more room than the viewport at a comfortable
// illustration size. Scrolling the whole page pushed Next and Skip off the
// bottom edge, where the CTA cannot be tapped; pinning the footer keeps both
// controls put and scrolls only the cards. On a roomy screen `my-auto` centres
// the content instead, and on a short screen the region scrolls — nothing is
// ever clipped.
//
// The illustration frame is a fixed height with `object-contain`, not the
// aspect ratios the old file declared. Two of the three sources are square
// (onboarding-2.png is 650x650, onboarding-3.png is 735x736) and were being
// cropped by `object-cover` inside a 362x236 / 362x285 box. A fixed box shows
// each illustration whole and gives all three slides the same visual rhythm
// whatever their intrinsic shape.

const FRAME = "relative mx-auto h-[190px] w-full"

const SLIDES = [
  {
    image: "/figma/onboarding-welcome.png",
    title: "Welcome to Mutagenic",
    description:
      "A product-label companion for ingredient signals and oral-care fluoride estimates.",
  },
  {
    image: "/figma/onboarding-2.png",
    title: "Solve Real World Product Questions",
    description:
      "Scan food and oral-care labels to review ingredient signals and label-based fluoride estimates.",
  },
  {
    image: "/figma/onboarding-3.png",
    title: "Understand What Labels Say",
    description:
      "Review ingredient signals and label-based estimates. Results explain their confidence and limits; they are not laboratory confirmation or medical advice.",
  },
] as const

export default function OnboardingPage() {
  const [slide, setSlide] = useState(0)
  const router = useRouter()
  const current = SLIDES[slide]
  const isLastSlide = slide === SLIDES.length - 1

  function finishOnboarding() {
    router.push("/register")
  }

  function continueOnboarding() {
    if (isLastSlide) {
      finishOnboarding()
      return
    }
    setSlide((currentSlide) => currentSlide + 1)
  }

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex h-dvh w-full max-w-[402px] flex-col bg-surface px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-10 outline-none"
    >
      <section
        aria-labelledby="onboarding-title"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div className="my-auto w-full py-4">
          <div className={FRAME}>
            <Image
              key={current.image}
              src={current.image}
              alt=""
              fill
              priority={slide === 0}
              className="object-contain"
              sizes="(max-width: 448px) calc(100vw - 40px), 362px"
            />
          </div>

          <h1
            id="onboarding-title"
            className="mt-4 text-balance text-center text-[28px] font-extrabold leading-9 tracking-[-0.6px] text-primary"
          >
            {current.title}
          </h1>
          <p className="mx-auto mt-2 max-w-[330px] text-center text-[14px] leading-5 text-gcheck-body">
            {current.description}
          </p>

          <div className="mt-6">
            {slide === 0 && <CapabilityProof />}
            {slide === 1 && <DiagnosticProof />}
            {slide === 2 && <TrustProof />}
          </div>
        </div>
      </section>

      <footer className="shrink-0 space-y-2 pt-3">
        <ProgressDots activeIndex={slide} />
        <Button
          type="button"
          size="lg"
          className="h-[52px] w-full rounded-[12px] bg-accent-mutagenic text-[16px] font-semibold text-white hover:bg-accent-mutagenic/90"
          onClick={continueOnboarding}
        >
          {isLastSlide ? "Get Started" : "Next"}
        </Button>
        <button
          type="button"
          onClick={finishOnboarding}
          className="flex min-h-11 w-full items-center justify-center rounded-md text-[12px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Skip
        </button>
      </footer>
    </main>
  )
}

/** Slide 1 — what the app covers, as three scannable chips. */
function CapabilityProof() {
  const items = [
    { icon: "/figma/onboarding-dual-diagnostics.svg", label: "Food & oral care" },
    { icon: "/figma/onboarding-ppm-lab.svg", label: "Label-based estimates" },
    { icon: "/figma/onboarding-registry.svg", label: "Product catalogue" },
  ]

  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {items.map(({ icon, label }) => (
        <li
          key={label}
          className="inline-flex items-center gap-1.5 rounded-full bg-gcheck-tint px-3 py-2 text-[11px] font-semibold text-primary shadow-xs"
        >
          <Image src={icon} alt="" width={14} height={14} className="size-3.5" />
          {label}
        </li>
      ))}
    </ul>
  )
}

/** Slide 2 — the two flows, each in its own category accent. */
function DiagnosticProof() {
  return (
    <div className="space-y-3">
      <DiagnosticCard
        icon="/figma/onboarding-food-purity.svg"
        title="GMO & Food Purity"
        badge="Label signals"
        category="gmo"
      >
        Review ingredient signals associated with GMO likelihood. A label photo cannot
        confirm GMO content.
      </DiagnosticCard>
      <DiagnosticCard
        icon="/figma/onboarding-fluoride.svg"
        title="Fluoride Diagnostic"
        badge="Label estimate"
        category="fluoride"
      >
        Estimate fluoride levels from listed compounds and printed concentrations for
        oral-care products. This is not medical advice.
      </DiagnosticCard>
    </div>
  )
}

/** Slide 3 — why a result can be trusted, and what it is built on. */
function TrustProof() {
  const proofs = [
    { icon: "/figma/onboarding-audit.svg", label: "Results", value: "Confidence shown" },
    { icon: "/figma/onboarding-audit-2.svg", label: "Analysis", value: "Rules-based" },
    { icon: "/figma/onboarding-audit-3.svg", label: "Corrections", value: "Reviewer queue" },
  ]

  return (
    <ul className="grid grid-cols-3 gap-2">
      {proofs.map(({ icon, label, value }) => (
        <li
          key={label}
          className="flex flex-col items-center gap-1 rounded-md bg-gcheck-tint px-1 py-2 text-center"
        >
          <Image src={icon} alt="" width={16} height={16} className="size-4" />
          <span className="text-[10px] font-semibold uppercase leading-[14px] tracking-[0.4px] text-muted-foreground">
            {label}
          </span>
          <span className="text-[11px] font-bold leading-[15px] text-primary">{value}</span>
        </li>
      ))}
    </ul>
  )
}

function DiagnosticCard({
  icon,
  title,
  badge,
  category,
  children,
}: {
  icon: string
  title: string
  badge: string
  category: "gmo" | "fluoride"
  children: string
}) {
  const isGmo = category === "gmo"

  return (
    <Panel
      variant="elevated"
      padding="none"
      className="rounded-lg border-0 bg-surface px-4 py-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md",
            isGmo
              ? "bg-accent-gmo-soft text-accent-gmo"
              : "bg-accent-fluoride-soft text-accent-fluoride"
          )}
        >
          <Image src={icon} alt="" width={24} height={24} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="truncate text-[15px] font-semibold leading-[22px] text-primary">
              {title}
            </h2>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-[14px] tracking-[0.4px]",
                isGmo
                  ? "bg-accent-gmo-soft text-accent-gmo"
                  : "bg-accent-fluoride-soft text-accent-fluoride"
              )}
            >
              {badge}
            </span>
          </div>
          <p className="mt-1.5 text-[12px] leading-[19px] text-gcheck-body">{children}</p>
        </div>
      </div>
    </Panel>
  )
}

function ProgressDots({ activeIndex }: { activeIndex: number }) {
  return (
    <div
      className="flex h-[22px] items-center justify-center gap-2"
      aria-label={`Onboarding screen ${activeIndex + 1} of ${SLIDES.length}`}
    >
      {SLIDES.map((slide, index) => (
        <span
          key={slide.title}
          aria-hidden="true"
          className={cn(
            "h-1.5 rounded-full transition-all",
            index === activeIndex ? "w-7 bg-accent-mutagenic" : "w-1.5 bg-border"
          )}
        />
      ))}
    </div>
  )
}
