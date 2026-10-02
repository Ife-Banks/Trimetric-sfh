// Scan activity for the hub's shield card: how many scans in the last seven
// days, and the current consecutive-day streak.
//
// Pure and unit-tested because "2 scans this week" and "7d" are read as facts.
// The design shows placeholder numbers; these are computed from the user's own
// scan timestamps so the card cannot flatter them.

export interface ScanActivity {
  /** Scans in the trailing seven days. */
  thisWeek: number
  /** Consecutive calendar days with at least one scan, ending today or yesterday. */
  streakDays: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/**
 * Local calendar day key.
 *
 * A streak counts DAYS, not 24-hour blocks: scanning at 11pm and again at 1am is
 * two consecutive days, not "one and a bit". Using UTC here would move the
 * day boundary for most of the world and break that.
 */
function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function scanActivity(timestamps: readonly string[], now: Date = new Date()): ScanActivity {
  const days = new Set<string>()
  let thisWeek = 0
  const weekAgo = now.getTime() - WEEK_MS

  for (const value of timestamps) {
    const at = new Date(value)
    const time = at.getTime()
    if (Number.isNaN(time)) continue
    // Future timestamps are a clock problem, not activity — never count them.
    if (time > now.getTime()) continue
    if (time >= weekAgo) thisWeek += 1
    days.add(dayKey(at))
  }

  // A streak may start today OR yesterday. Otherwise scanning every morning and
  // glancing at the app before the first scan of the day would report "0d",
  // which reads as a broken streak rather than a pending one.
  const cursor = new Date(now)
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)

  let streakDays = 0
  while (days.has(dayKey(cursor))) {
    streakDays += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return { thisWeek, streakDays }
}
