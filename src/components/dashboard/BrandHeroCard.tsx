import Image from "next/image"
import Link from "next/link"
import { BookOpen, ScanLine, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

// Brand hero card (Figma `bobby` 948:3178) — emblem, trust pill, headline, and
// the screen's single primary CTA.
//
// One primary action per screen (08 §3): "Check a Product" is it. "Learn About
// GMOs" is the secondary, so it uses the design's lavender fill rather than a
// tinted primary.
//
// `scanHref` is passed by the GMO flow so its hero starts a GMO scan
// explicitly. Without it, /scan resolves the user's Diagnostic Preference from
// Settings — which is the right default for a generic entry point, and the wrong
// one on a screen that is already named "GMO Check".
export function BrandHeroCard({ scanHref = "/scan" }: { scanHref?: string }) {
  return (
    <section className="relative overflow-hidden rounded-md bg-surface p-4 text-center">
      {/* Subtle biological aura glow in corner (948:3179) — mint at 25%,
          blurred, clipped by the card's overflow-hidden. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 -right-6 size-44 rounded-full bg-gcheck-mint/25 blur-3xl"
      />

      <div className="relative flex flex-col items-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-gcheck-tint">
          <Image
            src="/figma/gmo-check-emblem.png"
            alt=""
            width={64}
            height={64}
            className="size-16"
            priority
          />
        </span>

        <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-gcheck-mint/50 px-3 py-1 text-[11px] font-bold uppercase leading-[14px] tracking-[0.05em] text-gcheck-pill-ink">
          <ShieldCheck className="size-3" aria-hidden="true" />
          Trusted Food Transparency
        </p>

        <h2 className="mt-4 text-[28px] font-bold leading-9 tracking-[-0.7px] text-primary">
          Know what&apos;s in your food.
        </h2>

        <p className="mt-3 text-[14px] leading-5 text-gcheck-body">
          Scan a food product to estimate GMO likelihood based on ingredient parsing and
          regulatory certification database.
        </p>

        <div className="mt-4 w-full space-y-3">
          <Button
            asChild
            className="h-12 w-full rounded-sm text-[14px] font-semibold tracking-[0.01em]"
          >
            <Link href={scanHref}>
              <ScanLine className="size-4" aria-hidden="true" />
              Check a Product
            </Link>
          </Button>
          <Button
            asChild
            variant="secondary"
            className="h-11 w-full rounded-sm border-0 bg-secondary text-[14px] font-semibold tracking-[0.01em] text-primary shadow-none hover:bg-secondary/70"
          >
            <Link href="/learn">
              <BookOpen className="size-4" aria-hidden="true" />
              Learn About GMOs
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
