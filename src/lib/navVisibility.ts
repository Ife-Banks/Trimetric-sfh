// Whether the primary tab bar should be on screen right now.
//
// WHY THIS EXISTS
//   BottomNav renders from the root layout, so it cannot see a page's own
//   state — and the scan flow genuinely needs both behaviours: the bar has to
//   be gone while the camera viewfinder is up (a tab bar over a live camera is
//   unusable, and the capture screens are full-bleed with their own controls),
//   but it must come straight back the moment a result is on screen. Pathname
//   cannot express that. Hiding the bar for the whole of /scan — which is what
//   the pathname rule did — made tapping "Scan" look like the app had lost its
//   navigation entirely: the tab you just used was the one that removed it.
//
// SHAPE
//   The same module-store pattern as lib/preferences.ts and lib/savedScans.ts:
//   readable during render, referentially stable snapshots, and a server
//   snapshot that matches the first client render so hydration cannot drift.

let hidden = false
const listeners = new Set<() => void>()

/** Called by a page to hide/show the bar. Idempotent. */
export function setNavHidden(next: boolean): void {
  if (next === hidden) return
  hidden = next
  for (const listener of listeners) listener()
}

/**
 * The scan steps that own the whole screen and therefore hide the tab bar.
 *
 * Everything ELSE in the flow — review, a result, the add-product form, the
 * thanks screen — keeps it. That is the point of the list: finishing a scan must
 * not strand you on a screen with no navigation, which is exactly what happened
 * when the bar was hidden for the whole of /scan.
 */
export const SCAN_STEPS_WITHOUT_TAB_BAR = ["front", "back", "analyzing"] as const

export function scanStepHidesTabBar(step: string): boolean {
  return (SCAN_STEPS_WITHOUT_TAB_BAR as readonly string[]).includes(step)
}

export function subscribeToNav(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export function getNavHiddenSnapshot(): boolean {
  return hidden
}

// Server render and the first client render agree: visible unless a page has
// said otherwise, which no page has during SSR.
export function getNavHiddenServerSnapshot(): boolean {
  return false
}
