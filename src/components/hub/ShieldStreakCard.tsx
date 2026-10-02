"use client"

import Image from "next/image"
import { useSyncExternalStore } from "react"
import { Flame, ShieldCheck } from "lucide-react"
import { getScansServerSnapshot, getScansSnapshot, subscribeToScans } from "@/lib/savedScans"
import { scanActivity, type ScanActivity } from "@/lib/scanActivity"

// Mutagenic Shield activity card (Figma `Untitled`, frame 1:1246).
//
// The design shows "2 scans this week" and a "7d" streak as fixed placeholder
// text. Both are computed here from the user's own scan timestamps — the account
// table when signed in, the on-device store for guests, exactly like the Recent
// Checks feed.
//
// When neither source can be read, the card still renders but states only what
// is true. It never shows "0 scans this week" for a user whose history merely
// failed to load.
export function ShieldStreakCard({ accountActivity }: { accountActivity: ScanActivity | null }) {
  if (accountActivity) return <ShieldCard activity={accountActivity} />
  return <DeviceShieldCard />
}

function ShieldCard({ activity }: { activity: ScanActivity }) {
  return (
    <section
      className="flex items-center gap-3 rounded-sm bg-gcheck-tint p-3"
      aria-label="Scan activity"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-surface">
        <Image
          src="/figma/mutagenic-logo.png"
          alt=""
          width={36}
          height={34}
          className="h-8 w-9 object-contain"
        />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em] text-gcheck-accent">
          Mutagenic Shield
          <ShieldCheck className="size-3" aria-hidden="true" />
        </p>
        <p className="mt-0.5 truncate text-[12px] font-semibold text-foreground">
          {activity.thisWeek} {activity.thisWeek === 1 ? "scan" : "scans"} this week
        </p>
      </div>

      {activity.streakDays > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[12px] font-bold tabular-nums text-foreground">
          <Flame className="size-3.5 text-destructive" aria-hidden="true" />
          {activity.streakDays}d
        </span>
      )}
    </section>
  )
}

function DeviceShieldCard() {
  const scans = useSyncExternalStore(subscribeToScans, getScansSnapshot, getScansServerSnapshot)
  return <ShieldCard activity={scanActivity(scans.map((scan) => scan.savedAt))} />
}
