"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { Droplets, Leaf, ScanLine } from "lucide-react"
import {
  getScansServerSnapshot,
  getScansSnapshot,
  subscribeToScans,
} from "@/lib/savedScans"
import { FEED_LIMIT, feedScanFromSaved, type FeedScan } from "@/lib/scanFeed"
import { tierFraction } from "@/components/verdict/gaugeValue"
import {
  CONFIDENCE_LABEL,
  CONFIDENCE_TEXT,
  EVIDENCE_LABEL,
  TIER_FILL,
  TIER_PILL,
  tierKey,
} from "@/components/verdict/tierStyles"
import { Button } from "@/components/ui/button"
import { cn } from "cn"

// Recent Checks (Figma `bobby` 948:3086) — the scan feed.
//
// Two sources, one card:
//   • signed in → the `scans` table, passed in from the server. Real history,
//     across devices.
//   • guest     → lib/savedScans on the device, read through
//     useSyncExternalStore (reading storage in a useState initializer runs
//     during SSR and guarantees a hydration mismatch; the store hands the server
//     and the first client render the same empty list).
//
// The branch happens at the top of this component and each branch is its own
// component, so the guard is not a conditional hook.
//
// Two mappings the mock cannot answer, resolved from the design system rather
// than invented:
//   • the meter fill is coloured by RESULT tier, never always-green — a green
//     bar under a High-risk verdict is exactly the drift 06 §2 forbids;
//   • the right-hand label is the confidence, coloured from the --confidence-*
//     family, which is deliberately outside the result colours.
// The mock's "98.4%" has no stored counterpart, so that slot carries the real
// metric and disappears when there is none.

// "12m ago" — intentionally coarse. An exact timestamp belongs on the result,
// not on a glanceable feed row.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const minutes = Math.round((Date.now() - then) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function FeedCard({ scan }: { scan: FeedScan }) {
  const tier = tierKey(scan.resultTier)
  const fraction = tierFraction(scan.resultTier)
  const eyebrow = scan.brand?.trim() || (scan.category === "oral_care" ? "Oral care" : "GMO food")

  return (
    <li className="rounded-md bg-surface p-4">
      <div className="flex gap-3">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-sm bg-gcheck-tint">
          {scan.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data/object URL captured at scan time; next/image cannot optimise it
            <img src={scan.imageUrl} alt="" aria-hidden="true" className="size-full object-cover" />
          ) : scan.category === "oral_care" ? (
            // Account receipts carry no image by design (see the scans
            // migration), so the well shows the category instead of a broken
            // thumbnail placeholder.
            <Droplets className="size-5 text-muted-foreground/60" aria-hidden="true" />
          ) : (
            <Leaf className="size-5 text-muted-foreground/60" aria-hidden="true" />
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[18px] items-center justify-between gap-2">
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.04em] text-gcheck-body">
              {eyebrow}
            </p>
            <span className="shrink-0 text-[13px] font-medium text-gcheck-body">
              {relativeTime(scan.at)}
            </span>
          </div>

          <p className="truncate text-[16px] font-semibold leading-6 text-foreground">{scan.name}</p>

          <div className="flex h-[22px] items-center gap-2">
            <span
              className={cn(
                "inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[11px] font-bold tracking-[0.04em]",
                TIER_PILL[tier]
              )}
            >
              {scan.resultLabel}
            </span>
            {scan.metric && (
              <span className="ml-auto shrink-0 text-[13px] font-bold tabular-nums text-foreground">
                {scan.metric}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-secondary"
          role="img"
          aria-label={`${scan.resultLabel} result strength`}
        >
          <span
            className={cn("block h-full rounded-full", TIER_FILL[tier])}
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-bold tracking-[0.04em] text-gcheck-body">
            {EVIDENCE_LABEL[scan.identityMatch]}
          </span>
          <span
            className={cn(
              "truncate text-[11px] font-semibold tracking-[0.04em]",
              CONFIDENCE_TEXT[scan.confidenceTier]
            )}
          >
            {CONFIDENCE_LABEL[scan.confidenceTier]}
          </span>
        </div>
      </div>
    </li>
  )
}

function FeedSection({ rows, total }: { rows: FeedScan[]; total: number }) {
  return (
    <section aria-label="Recent checks">
      <div className="flex h-6 items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-primary">Recent Checks</h2>
        <Link
          href="/history"
          className="shrink-0 text-[13px] font-semibold text-gcheck-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          View All{total > 0 ? ` (${total})` : ""}
        </Link>
      </div>

      <ul className="mt-2 space-y-3">
        {rows.length === 0 ? (
          <li className="rounded-md border border-dashed border-border bg-surface p-4 text-center">
            <p className="text-[14px] font-semibold text-primary">No checks yet</p>
            <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
              Scan a product and the result shows up here.
            </p>
            <Button asChild className="mt-3 h-10 rounded-sm text-[13px]">
              <Link href="/scan">
                <ScanLine className="size-4" aria-hidden="true" />
                Start a scan
              </Link>
            </Button>
          </li>
        ) : (
          rows.map((scan) => <FeedCard key={scan.id} scan={scan} />)
        )}
      </ul>
    </section>
  )
}

function DeviceRecentChecks() {
  const scans = useSyncExternalStore(subscribeToScans, getScansSnapshot, getScansServerSnapshot)
  return (
    <FeedSection
      rows={scans.slice(0, FEED_LIMIT).map(feedScanFromSaved)}
      total={scans.length}
    />
  )
}

export function RecentChecks({
  accountFeed,
}: {
  accountFeed: { rows: FeedScan[]; total: number } | null
}) {
  if (accountFeed) return <FeedSection rows={accountFeed.rows} total={accountFeed.total} />
  return <DeviceRecentChecks />
}
