"use client"

import { useState } from "react"
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  CircleHelp,
  Lightbulb,
  LoaderCircle,
  PackageSearch,
  Search,
} from "lucide-react"
import type { EngineContext, EngineResult } from "@/engines/types"
import type { ProductIdentity } from "@/components/diagnostic/DiagnosticResult"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Panel } from "@/components/ui/panel"
import { Overline } from "@/components/ui/overline"
import { ConstraintNotice } from "@/components/verdict/ConstraintNotice"

export function UnverifiedScreen({
  identity,
  result,
  engineContext,
  photoUrl,
  frontPanelReadable = true,
  onRescan,
  onViewResult,
  onAddProduct,
  onManualSearch,
}: {
  identity: ProductIdentity
  result: EngineResult
  engineContext: EngineContext
  photoUrl?: string | null
  /**
   * Whether the front panel produced a searchable product name. When false the
   * catalogue was never actually searched, so this screen must not blame the
   * catalogue — doing so sends the user off to re-check a database that may well
   * contain the product.
   */
  frontPanelReadable?: boolean
  onRescan: () => void
  onViewResult: () => void
  onAddProduct: () => void
  onManualSearch: (productName: string) => Promise<boolean>
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchName, setSearchName] = useState(identity.name === "Unidentified product" ? "" : identity.name)
  const [searching, setSearching] = useState(false)
  const [searchMessage, setSearchMessage] = useState("")

  async function searchCatalogue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = searchName.trim()
    if (!value) {
      setSearchMessage("Enter a product name or brand to search.")
      return
    }
    setSearching(true)
    setSearchMessage("")
    try {
      const found = await onManualSearch(value)
      if (!found) setSearchMessage("No catalogue match found. Check the spelling or submit the product for review.")
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : "Search failed. Please try again.")
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-3 text-left">
      <header className="flex h-10 items-center gap-2 border-b border-border/70">
        <Button type="button" variant="ghost" size="icon" aria-label="Back to scan" onClick={onRescan}>
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Button>
        <span className="flex-1 text-label font-semibold">Product Details</span>
        <span className="grid size-8 place-items-center rounded-full bg-success/10 text-success" aria-hidden="true">
          <CheckCircle2 className="size-4" />
        </span>
      </header>

      <div className="space-y-3 rounded-xl border border-dashed border-primary/50 bg-surface-muted/40 p-3">
        <div className="flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-1 text-[10px] font-semibold text-success">
          <CheckCircle2 className="size-3" aria-hidden="true" />
          Community Database Contribution
        </div>

        <Panel variant="elevated" padding="md" className="space-y-2 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-success/10 text-success">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL from the user's captured package image
              <img src={photoUrl} alt={`Scanned package: ${identity.name}`} className="size-14 rounded-full object-cover" />
            ) : (
              <PackageSearch className="size-8" aria-hidden="true" />
            )}
          </div>
          <p className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">
            <Search className="size-3" aria-hidden="true" />
            Scanned product: {identity.name}
          </p>
          <h1 className="text-lg font-bold leading-tight text-foreground">
            {frontPanelReadable
              ? "We couldn't find this product"
              : "We couldn't read the front label"}
          </h1>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {frontPanelReadable ? (
              <>
                We don&apos;t have enough information about this product in our
                database yet. Your community contribution helps us help more
                shoppers like you!
              </>
            ) : (
              <>
                The product name on the <strong className="font-semibold text-foreground">front</strong> label
                couldn&apos;t be read, so we couldn&apos;t search our database for
                it. This is about the photo, not the product — the result below was
                calculated from the ingredients panel, which did read.
              </>
            )}
          </p>
        </Panel>

        <Panel variant="elevated" padding="sm" className="space-y-2">
          <Overline><span className="inline-flex items-center gap-1"><Lightbulb className="size-3.5 text-warning" aria-hidden="true" /> Quick scanning tips</span></Overline>
          <div className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <p className="flex gap-2 rounded-lg bg-surface-muted p-2"><Camera className="size-4 shrink-0 text-success" aria-hidden="true" />Make sure the product name is fully visible within the camera viewfinder.</p>
            <p className="flex gap-2 rounded-lg bg-surface-muted p-2"><CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />Check that the ingredients panel isn&apos;t wrinkled, torn, or obstructed by glare.</p>
            {!frontPanelReadable && (
              // The measured failure mode: a tube photographed at an angle, small
              // in frame, on a cluttered background. Real OCR runs returned 29
              // characters of pure noise on exactly this shot, while the same label
              // photographed straight-on read at 0.9 confidence.
              <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-warning">
                <Camera className="size-4 shrink-0" aria-hidden="true" />
                <span>
                  <strong className="font-semibold">For the front label:</strong> hold
                  the phone parallel to the pack, fill the frame with it, and avoid a
                  busy background. Angled shots of a tube are the most common reason
                  the name can&apos;t be read.
                </span>
              </p>
            )}
          </div>
        </Panel>

        <div className="space-y-1.5">
          <Button type="button" size="sm" variant="outline" className="h-11 w-full" onClick={onViewResult}>
            View {result.category === "oral_care" ? "provisional fluoride result" : "screening result"}
          </Button>
          <Button type="button" size="sm" className="h-11 w-full bg-emerald-950 text-ink-on-brand hover:bg-emerald-900" onClick={onAddProduct}>
            <CircleHelp className="size-4" aria-hidden="true" /> Submit Product
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-11 w-full text-xs" onClick={onRescan}>
            <Camera className="size-4" aria-hidden="true" /> Try Another Product
          </Button>
          {!searchOpen ? (
            <Button type="button" variant="link" size="sm" className="h-11 w-full text-xs text-success" onClick={() => setSearchOpen(true)}>
              <Search className="size-3.5" aria-hidden="true" /> Search database manually by brand name
            </Button>
          ) : (
            <form onSubmit={(event) => void searchCatalogue(event)} className="space-y-2 pt-1">
              <label htmlFor="manual-product-search" className="sr-only">Search product name or brand</label>
              <div className="flex gap-2">
                <Input id="manual-product-search" value={searchName} onChange={(event) => setSearchName(event.target.value)} placeholder="Product name or brand" className="h-11 text-sm" />
                <Button type="submit" size="icon" className="size-11 shrink-0" disabled={searching} aria-label="Search catalogue">
                  {searching ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
                </Button>
              </div>
              {searchMessage && <p role="status" className="text-xs leading-relaxed text-muted-foreground">{searchMessage}</p>}
            </form>
          )}
        </div>
      </div>
      <p className="text-center text-[10px] text-muted-foreground">
        Result based on scanned label text · OCR confidence {(engineContext.ocrMeanConfidence * 100).toFixed(0)}% · Ruleset v{result.configVersion}
      </p>

      {/* 06_AGENT_CONTEXT.md §2 constraint 2: the honesty statement is
          non-negotiable and not dismissible. This screen is where every
          cold-start scan lands, and it was the one verdict-adjacent surface
          without the notice — a user could sit here indefinitely without
          seeing it. */}
      <ConstraintNotice notice={result.constraintNotice} />
    </div>
  )
}
