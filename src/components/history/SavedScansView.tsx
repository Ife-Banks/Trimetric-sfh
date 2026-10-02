"use client"

// SavedScansView — the "Verified" tab of History (Figma 52:593 "Product
// Verified Card" list). Renders scans the user chose to keep via "Save to My
// History" from a DiagnosticResult. Client-only localStorage store
// (lib/savedScans) — this is a convenience receipt, never the authoritative
// dataset: re-scanning still hits the catalogue. Each card mirrors the Product
// Verified Card: photo, name, brand, category, result tier + separate
// confidence, and the real metric captured at scan time.

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { History, ImageIcon, Trash2, ScanLine } from "lucide-react"
import {
  getScansServerSnapshot,
  getScansSnapshot,
  removeScan,
  subscribeToScans,
  type SavedScan,
} from "@/lib/savedScans"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { CategoryBadge } from "@/components/ui/category-badge"

const RESULT_LABEL: Record<"low" | "medium" | "high", string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
}

function tierChip(tier: string): string {
  switch (tier) {
    case "high":
      return "border-destructive/30 bg-destructive/10 text-destructive"
    case "medium":
      return "border-warning/35 bg-warning/10 text-warning"
    case "low":
      return "border-success/30 bg-success/10 text-success"
    default:
      return "border-border/60 bg-tier-none/10 text-tier-none"
  }
}

function VerifiedCard({
  scan,
  onRemove,
}: {
  scan: SavedScan
  onRemove: (id: string) => void
}) {
  return (
    <li className="flex gap-3 rounded-lg border border-border/80 bg-surface p-3 shadow-sm">
      {scan.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- data/object URL from the scan; next/image can't optimize it
        <img
          src={scan.imageUrl}
          alt=""
          aria-hidden="true"
          className="size-16 shrink-0 rounded-lg border object-cover"
        />
      ) : (
        <div className="grid size-16 shrink-0 place-items-center rounded-lg border border-dashed">
          <ImageIcon className="size-6 text-muted-foreground/60" aria-hidden="true" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{scan.name}</p>
            {scan.brand && <p className="truncate text-xs text-muted-foreground">{scan.brand}</p>}
          </div>
          <CategoryBadge category={scan.category} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tierChip(scan.resultTier)}`}>
            {scan.resultLabel}
          </span>
          <span className="inline-flex items-center rounded-md border border-confidence-medium/40 bg-confidence-medium/10 px-2 py-0.5 text-xs font-semibold text-confidence-medium">
            {RESULT_LABEL[scan.confidenceTier]} confidence
          </span>
          {scan.metric && (
            <span className="text-xs tabular-nums text-muted-foreground">{scan.metric}</span>
          )}
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          Saved {new Date(scan.savedAt).toLocaleString()}
        </p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${scan.name} from history`}
        className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(scan.id)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </li>
  )
}

export function SavedScansView() {
  // useSyncExternalStore rather than useState + effect. Reading localStorage in
  // a useState initializer runs during SSR (window is undefined, the throw is
  // swallowed, `[]` is returned), so the server emitted the empty state while
  // the client immediately rendered the real list — a guaranteed hydration
  // mismatch for every user who had ever saved a scan. Reading through the
  // store fixes that and keeps the value in sync across tabs/windows.
  const scans = useSyncExternalStore(subscribeToScans, getScansSnapshot, getScansServerSnapshot)

  if (scans.length === 0) {
    return (
      <EmptyState
        icon={<History className="size-5" aria-hidden="true" />}
        title="No saved scans yet"
        description="Run a scan and tap “Save to My History” on the result to keep it here."
        action={
          <Button asChild size="sm">
            <Link href="/scan">
              <ScanLine className="size-4" aria-hidden="true" />
              Start a scan
            </Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            scans.forEach((s) => removeScan(s.id))
          }}
        >
          Clear history
        </Button>
      </div>
      <ul className="space-y-3">
        {scans.map((scan) => (
          <VerifiedCard
            key={scan.id}
            scan={scan}
            onRemove={(id) => removeScan(id)}
          />
        ))}
      </ul>
    </div>
  )
}