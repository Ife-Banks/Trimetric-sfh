"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/ui/panel"

const SLIDES = [
  {
    image: "/figma/onboarding-1.png",
    imageClassName: "aspect-[626/417]",
    title: "Welcome to Mutagenic",
    description:
      "Your trusted product ingredient companion for clinical dental safety and authentic purity.",
  },
  {
    image: "/figma/onboarding-2.png",
    imageClassName: "aspect-[362/236]",
    title: "Solve Real World Product Questions",
    description:
      "Instant scanning for fluoride concentration levels and certified Non-GMO ingredient verification at your fingertips.",
  },
  {
    image: "/figma/onboarding-3.png",
    imageClassName: "aspect-[362/285]",
    title: "Know Exactly What You’re Buying",
    description:
      "Make informed, healthy decisions every time you shop with instant chemical transparency. SafeScan puts clinical toxicology and laboratory certifications directly in your hands to protect your daily health and family.",
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
      className="mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col bg-surface px-5 pt-10 pb-6 outline-none md:px-8"
    >
      <section className="flex flex-1 flex-col" aria-labelledby="onboarding-title">
        <div className="mx-auto w-full max-w-sm">
          <div className={`relative overflow-hidden ${current.imageClassName}`}>
            <Image
              key={current.image}
              src={current.image}
              alt=""
              fill
              priority={slide === 0}
              className="object-cover"
              sizes="(max-width: 448px) calc(100vw - 40px), 362px"
            />
          </div>
        </div>

        <div className="mt-6 text-center">
          <h1 id="onboarding-title" className="text-display font-bold tracking-tight">
            {current.title}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-body text-muted-foreground">
            {current.description}
          </p>
        </div>

        {slide === 0 && <WelcomeProof />}
        {slide === 1 && <DiagnosticProof />}
        {slide === 2 && <TrustProof />}
      </section>

      <footer className="mt-6 space-y-3">
        <ProgressDots activeIndex={slide} />
        <Button type="button" size="lg" className="w-full rounded-md" onClick={continueOnboarding}>
          {isLastSlide ? "Get Started" : "Next"}
        </Button>
        <button
          type="button"
          onClick={finishOnboarding}
          className="flex min-h-11 w-full items-center justify-center rounded-md text-caption font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Skip
        </button>
      </footer>
    </main>
  )
}

function WelcomeProof() {
  return (
    <div className="mt-8 flex flex-wrap justify-center gap-2">
      <ProofPill icon="/figma/onboarding-dual-diagnostics.svg">Dual Diagnostics</ProofPill>
      <ProofPill icon="/figma/onboarding-ppm-lab.svg">Fluoride PPM Lab</ProofPill>
      <ProofPill icon="/figma/onboarding-registry.svg">Non-GMO Registry</ProofPill>
    </div>
  )
}

function DiagnosticProof() {
  return (
    <div className="mt-8 space-y-4">
      <DiagnosticCard
        icon="/figma/onboarding-food-purity.svg"
        title="GMO & Food Purity"
        badge="Clean log"
        category="gmo"
      >
        Verify bioengineered DNA absence and USDA Organic certifications with deep chemical taxonomy.
      </DiagnosticCard>
      <DiagnosticCard
        icon="/figma/onboarding-fluoride.svg"
        title="Fluoride Diagnostic"
        badge="PPM metric"
        category="fluoride"
      >
        Analyze fluoride concentration levels, ingredient toxicity, and chemical safety across mouthwashes, toothpastes, and everyday personal care items.
      </DiagnosticCard>
    </div>
  )
}

function TrustProof() {
  const proofs = [
    { icon: "/figma/onboarding-audit.svg", label: "Audits", value: "100% Indep." },
    { icon: "/figma/onboarding-audit-2.svg", label: "Audits", value: "100% Indep." },
    { icon: "/figma/onboarding-audit-3.svg", label: "Audits", value: "100% Indep." },
  ]

  return (
    <div className="mt-6 grid grid-cols-3 gap-2">
      {proofs.map(({ icon, label, value }, index) => (
        <div key={icon} className="flex min-h-14 flex-col items-center justify-center rounded-md bg-accent-fluoride-soft/60 px-1 text-center">
          <Image src={icon} alt="" width={17} height={17} className="size-4" />
          <span className="mt-1 text-overline uppercase text-muted-foreground">{label}</span>
          <span className="text-caption font-bold">{value}</span>
        </div>
      ))}
    </div>
  )
}

function ProofPill({
  icon,
  children,
}: {
  icon: string
  children: string
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-accent-fluoride-soft px-3 py-2 text-overline font-semibold tracking-wide text-foreground shadow-xs">
      <Image src={icon} alt="" width={13} height={13} className="size-3" />
      {children}
    </span>
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
  const accentClasses = isGmo
    ? "bg-accent-gmo-soft text-accent-gmo"
    : "bg-accent-fluoride-soft text-accent-fluoride"

  return (
    <Panel variant="elevated" padding="none" className="p-4">
      <div className="flex gap-4">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-md ${accentClasses}`}>
          <Image src={icon} alt="" width={24} height={24} className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-h3 font-semibold tracking-tight">{title}</h2>
            <span className={`rounded-full px-2 py-1 text-overline font-bold uppercase ${accentClasses}`}>
              {badge}
            </span>
          </div>
          <p className="mt-2 text-caption leading-relaxed text-muted-foreground">{children}</p>
        </div>
      </div>
    </Panel>
  )
}

function ProgressDots({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="flex h-6 items-center justify-center gap-2" aria-label={`Onboarding screen ${activeIndex + 1} of 3`}>
      {SLIDES.map((slide, index) => (
        <span
          key={slide.title}
          className={`h-1.5 rounded-full ${index === activeIndex ? "w-7 bg-primary" : "size-1.5 bg-accent-fluoride-soft"}`}
        />
      ))}
    </div>
  )
}
