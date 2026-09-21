import Image from "next/image"
import Link from "next/link"
import {
  Bell,
  CheckCircle2,
  Clock3,
  Leaf,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/ui/panel"

// Home hub — the two category cards are distinct entry points, while the
// capture pipeline remains responsible for its normal product classification.
// The status/profile copy is intentionally presentational: there is no scan
// history or subscription data source in the application yet.
const SCAN_HUBS = [
  {
    href: "/scan",
    category: "gmo" as const,
    eyebrow: "Organic verification",
    title: "GMO Check",
    status: "DNA Checked",
    description:
      "Analyze food & ingredients for bioengineered DNA, synthetic additives, and certified Non-GMO validation.",
    criteria: ["Non-GMO Project", "USDA Organic"],
    cta: "Verify Food",
  },
  {
    href: "/scan",
    category: "fluoride" as const,
    eyebrow: "Clinical oral care",
    title: "Fluoride Scan",
    status: "Safe PPM",
    description:
      "Check dental product safety, calibrated fluoride PPM thresholds, and enamel RDA abrasiveness index.",
    criteria: ["PPM Limits (1,000–1,500)", "RDA Safe < 250"],
    cta: "Scan Oral Care",
  },
]

export default function Home() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto w-full max-w-md flex-1 px-5 pt-6 pb-8 outline-none md:px-8"
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative size-9 overflow-hidden" aria-hidden="true">
            <Image
              src="/figma/home-logo.png"
              alt=""
              width={70}
              height={74}
              className="absolute -left-[17px] -top-[14px] h-[74px] w-[70px] max-w-none"
              priority
            />
          </span>
          <span className="text-h3 font-bold tracking-tight text-primary">SHF</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="relative flex size-8 items-center justify-center rounded-full bg-accent-fluoride-soft text-foreground"
          >
            <Bell className="size-4" />
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-destructive" />
          </span>
        </div>
      </header>

      <section className="mt-8 flex items-center gap-3" aria-label="Welcome">
        <Image
          src="/figma/home-profile.png"
          alt=""
          width={48}
          height={48}
          className="size-12 rounded-full object-cover shadow-xs"
        />
        <div>
          <h1 className="text-h2 font-bold tracking-tight">Hello!</h1>
          <p className="mt-1 text-caption text-muted-foreground">
            Your wellness guardian is active
          </p>
        </div>
      </section>

      <section className="mt-4 flex items-center justify-between gap-3 rounded-md bg-accent-fluoride-soft p-2" aria-label="Scan readiness">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src="/figma/home-shield-logo.png"
            alt=""
            width={40}
            height={40}
            className="size-10 rounded-md bg-surface object-contain p-1"
          />
          <div className="min-w-0">
            <p className="text-overline font-bold uppercase text-primary">SafeScan Shield</p>
            <p className="mt-1 text-caption font-medium">Ready when you are</p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-2 py-1 text-caption font-semibold shadow-xs">
          <Clock3 className="size-3 text-destructive" aria-hidden="true" />
          7d
        </span>
      </section>

      <section className="mt-6 space-y-6" aria-label="Choose a scan">
        {SCAN_HUBS.map((hub) => (
          <ScanHubCard key={hub.title} {...hub} />
        ))}
      </section>
    </main>
  )
}

function ScanHubCard({
  href,
  category,
  eyebrow,
  title,
  status,
  description,
  criteria,
  cta,
}: (typeof SCAN_HUBS)[number]) {
  const isGmo = category === "gmo"
  const AccentIcon = isGmo ? Leaf : ShieldCheck

  return (
    <Panel variant="elevated" padding="none" className="gap-5 p-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <span
              className={`flex size-11 shrink-0 items-center justify-center rounded-md ${
                isGmo
                  ? "bg-accent-gmo-soft text-accent-gmo"
                  : "bg-accent-fluoride-soft text-accent-fluoride"
              }`}
            >
              <AccentIcon className="size-6" aria-hidden="true" />
            </span>
            <div>
              <p className={`text-overline uppercase ${isGmo ? "text-accent-gmo" : "text-accent-fluoride"}`}>
                {eyebrow}
              </p>
              <h2 className="text-h2 font-bold tracking-tight">{title}</h2>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-overline font-semibold tracking-wide ${
              isGmo
                ? "bg-accent-gmo-soft text-accent-gmo"
                : "bg-accent-fluoride-soft text-accent-fluoride"
            }`}
          >
            {status}
          </span>
        </div>
        <p className="mt-4 text-body text-muted-foreground">{description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {criteria.map((criterion) => (
            <span key={criterion} className="inline-flex items-center gap-1 rounded-full bg-accent-fluoride-soft px-2 py-1 text-overline font-medium text-muted-foreground">
              {isGmo ? <CheckCircle2 className="size-3 text-accent-gmo" aria-hidden="true" /> : <Sparkles className="size-3 text-accent-fluoride" aria-hidden="true" />}
              {criterion}
            </span>
          ))}
        </div>
      </div>
      <Button asChild size="lg" className={`w-full rounded-md ${isGmo ? "bg-accent-gmo hover:bg-accent-gmo/90" : "bg-primary hover:bg-primary/90"}`}>
        <Link href={href}>
          <ScanLine className="size-5" aria-hidden="true" />
          {cta} <span aria-hidden="true">→</span>
        </Link>
      </Button>
    </Panel>
  )
}
