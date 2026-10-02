import { describe, it, expect } from "vitest"
import { scanActivity } from "@/lib/scanActivity"

// Fixed "now" so the assertions cannot drift with the wall clock. 2026-10-02 is
// a Friday; local noon keeps the day boundary unambiguous.
const NOW = new Date("2026-10-02T12:00:00")

function daysAgo(n: number, hour = 9): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() - n)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

describe("scanActivity", () => {
  it("reports nothing for no scans", () => {
    expect(scanActivity([], NOW)).toEqual({ thisWeek: 0, streakDays: 0 })
  })

  it("counts only the trailing seven days", () => {
    const { thisWeek } = scanActivity(
      [daysAgo(0), daysAgo(3), daysAgo(6), daysAgo(8), daysAgo(40)],
      NOW
    )
    expect(thisWeek).toBe(3)
  })

  it("counts consecutive days as a streak", () => {
    expect(scanActivity([daysAgo(0), daysAgo(1), daysAgo(2)], NOW).streakDays).toBe(3)
  })

  it("still counts a streak that starts yesterday", () => {
    // Scanning every morning and opening the app before today's scan should not
    // read as a broken streak.
    expect(scanActivity([daysAgo(1), daysAgo(2), daysAgo(3)], NOW).streakDays).toBe(3)
  })

  it("stops the streak at the first missing day", () => {
    expect(scanActivity([daysAgo(0), daysAgo(1), daysAgo(3), daysAgo(4)], NOW).streakDays).toBe(2)
  })

  it("counts several scans on one day as one streak day", () => {
    const { thisWeek, streakDays } = scanActivity(
      // All before NOW (noon) — a timestamp later today would rightly be
      // rejected as a clock problem, not counted as activity.
      [daysAgo(0, 6), daysAgo(0, 7), daysAgo(0, 11), daysAgo(1)],
      NOW
    )
    expect(thisWeek).toBe(4)
    expect(streakDays).toBe(2)
  })

  it("breaks the streak when the last scan was two days ago", () => {
    expect(scanActivity([daysAgo(2), daysAgo(3)], NOW).streakDays).toBe(0)
  })

  it("ignores unparseable and future timestamps", () => {
    const tomorrow = new Date(NOW)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const { thisWeek, streakDays } = scanActivity(
      ["not-a-date", "", tomorrow.toISOString(), daysAgo(0)],
      NOW
    )
    expect(thisWeek).toBe(1)
    expect(streakDays).toBe(1)
  })
})
