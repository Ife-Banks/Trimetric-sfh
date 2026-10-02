import Image from "next/image"
import { MonitorX } from "lucide-react"

// The notice a laptop sees instead of the app.
//
// Server-rendered and static on purpose: it is shown and hidden entirely by the
// `[data-mobile-gate]` media query in globals.css, so there is no viewport check
// in JS, no hydration boundary, and no frame where a desktop paints the phone
// layout before this appears. It also means the copy is in the initial HTML,
// which is what a search engine or a link preview will read.
//
// Rendered from the root layout, so every route is covered except /admin (the
// review console, which stands the rule down with `data-desktop-ok`).
export function MobileOnlyGate() {
  return (
    <div
      data-mobile-gate
      className="min-h-dvh w-full flex-col items-center justify-center gap-6 bg-background px-8 py-12 text-center"
    >
      <div className="flex items-center gap-2">
        <Image
          src="/figma/mutagenic-logo.png"
          alt=""
          width={36}
          height={34}
          className="h-[34px] w-9 object-contain"
        />
        <span className="text-[18px] font-extrabold tracking-[-0.2px] text-wordmark">
          MUTAGENIC
        </span>
      </div>

      <span
        className="flex size-16 items-center justify-center rounded-full bg-accent-mutagenic-soft text-accent-mutagenic"
        aria-hidden="true"
      >
        <MonitorX className="size-7" />
      </span>

      <div className="max-w-xs">
        <h1 className="text-[22px] font-bold leading-7 tracking-[-0.4px] text-primary">
          Switch to a mobile device
        </h1>
        <p className="mt-2 text-[14px] leading-5 text-gcheck-body">
          MUTAGENIC reads product labels with your camera, so it is built for
          phones and tablets. Open this page on one of those to continue.
        </p>
      </div>

      <p className="text-[12px] leading-4 text-muted-foreground">
        This screen is too wide for the scan layout.
      </p>
    </div>
  )
}
