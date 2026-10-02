"use client"

import {
  BadgeCheck,
  Check,
  Clock3,
  ClipboardCheck,
  Home,
  ScanLine,
  ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/ui/panel"

export function ThanksScreen({
  reference,
  productName,
  brand,
  category,
  photoUrl,
  onAnother,
  onDone,
}: {
  reference: string
  productName: string
  brand: string
  category: "gmo_food" | "oral_care"
  photoUrl?: string | null
  onAnother: () => void
  onDone: () => void
}) {
  const categoryLabel = category === "gmo_food" ? "GMO" : "ORAL-CARE"

  return (
    <div className="space-y-3 pb-4 text-center">
      <span className="relative mx-auto grid size-16 place-items-center rounded-full bg-success/10 text-success">
        <BadgeCheck className="size-10" aria-hidden="true" />
        <span className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full border-2 border-background bg-success text-ink-on-brand"><Check className="size-3.5" aria-hidden="true" /></span>
      </span>

      <div className="space-y-1.5">
        <h1 className="text-xl font-bold tracking-tight">Thanks for contributing!</h1>
        <p className="mx-auto max-w-[34ch] text-xs leading-relaxed text-muted-foreground">
          Your submission has been sent for review. We&apos;ll notify you when our food-science team and verified database team have completed the audit.
        </p>
      </div>

      <Panel variant="elevated" padding="sm" className="space-y-2 text-left">
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-muted-foreground"><ClipboardCheck className="size-3" aria-hidden="true" /> Submission reference</span>
          <code className="truncate font-semibold text-success">{categoryLabel}-{reference}</code>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-surface-muted p-2">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local capture object URLs aren't supported by next/image
            <img src={photoUrl} alt={`Submitted package of ${productName}`} className="size-12 rounded-md object-cover" />
          ) : <span className="grid size-12 place-items-center rounded-md bg-success/10 text-success"><ShieldCheck className="size-5" aria-hidden="true" /></span>}
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-xs font-semibold">{productName}</p>
            <p className="truncate text-[10px] text-muted-foreground">{brand || "Brand not provided"}</p>
          </div>
          <span className="max-w-24 rounded-full bg-warning/10 px-2 py-1 text-center text-[9px] font-semibold leading-tight text-warning">Under Food Safety Review</span>
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-2 text-[10px]">
          <span className="text-muted-foreground">Current status</span>
          <span className="inline-flex items-center gap-1 font-semibold text-warning"><Clock3 className="size-3" aria-hidden="true" /> Pending verification</span>
        </div>
      </Panel>

      <Panel variant="elevated" padding="sm" className="space-y-3 text-left">
        <div className="flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold"><Clock3 className="size-3.5 text-success" aria-hidden="true" /> What happens next</h2>
          <span className="rounded-full bg-success/10 px-2 py-1 text-[9px] font-semibold text-success">Step 1 of 3</span>
        </div>
        <ol className="space-y-3">
          <li className="flex gap-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success text-ink-on-brand"><Check className="size-3.5" aria-hidden="true" /></span>
            <span><strong className="block text-[11px]">Submission received</strong><span className="block text-[10px] leading-relaxed text-muted-foreground">Your product details and package photos are saved securely.</span></span>
          </li>
          <li className="flex gap-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success/10 text-success"><Clock3 className="size-3.5" aria-hidden="true" /></span>
            <span><strong className="block text-[11px]">Verification review</strong><span className="block text-[10px] leading-relaxed text-muted-foreground">A reviewer checks the label evidence and submitted details.</span></span>
          </li>
          <li className="flex gap-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><ShieldCheck className="size-3.5" aria-hidden="true" /></span>
            <span><strong className="block text-[11px]">Results published to the community</strong><span className="block text-[10px] leading-relaxed text-muted-foreground">If approved, the product can be added to the database for future scans.</span></span>
          </li>
        </ol>
      </Panel>

      <p className="rounded-lg bg-success/5 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mr-1 inline size-3.5 text-success" aria-hidden="true" />Your contribution helps keep the community database useful. Review timing can vary; submitted claims are not verified until the audit is complete.
      </p>

      <div className="grid gap-2 pt-1">
        <Button type="button" size="sm" className="h-11 w-full bg-emerald-950 text-ink-on-brand hover:bg-emerald-900" onClick={onDone}>
          Done <Check className="size-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-11 w-full" onClick={onAnother}>
          <ScanLine className="size-4" aria-hidden="true" /> Scan Another Product
        </Button>
        <Button type="button" variant="link" size="sm" className="h-11 w-full" onClick={onDone}>
          <Home className="size-3.5" aria-hidden="true" /> Return to dashboard
        </Button>
      </div>
    </div>
  )
}
