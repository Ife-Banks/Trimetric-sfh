"use client"

// DiagnosticResult — the verdict seam for the tagged result screens (Figma
// 16:198 Low / 35:135 Medium / 45:144 High). Category-agnostic: renders ANY
// EngineResult (gmo_food or oral_care) with the canonical order — prominent
// result title + real metric, ResultBadge, ResultGauge, then the ConfidenceBadge
// as a deliberately different shape (06_AGENT_CONTEXT §2, never merged), a
// Product Verified Card (or "provisional" framing when there is no catalogue
// match), the Verified Result checklist, Save to My History, "View Detailed
// Breakdown", the never-dismissible ConstraintNotice, and rescan/add actions.
//
// Non-negotiables preserved: result ≠ confidence, no fabricated percentages
// (the gauge/metric is real engine output), constraint notice always visible.

import { useState } from "react"
import { BadgeCheck, Bookmark, CheckCircle2, ChevronLeft, ChevronDown, History, ImageIcon, Share2 } from "lucide-react"
import type { EngineContext, EngineResult } from "@/engines/types"
import type { IdentityMatch } from "@/lib/identification/productIdentification"
import { NAME_MATCH_STRONG } from "@/engines/constants"
import { saveScan, type SavedScan } from "@/lib/savedScans"
import { toThumbnailDataUrl } from "@/lib/ocr/image"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/ui/panel"
import { Overline } from "@/components/ui/overline"
import { toast } from "sonner"
import { ResultBadge } from "../verdict/ResultBadge"
import { ConfidenceBadge } from "../verdict/ConfidenceBadge"
import { ResultGauge } from "../verdict/ResultGauge"
import { gaugeValue } from "../verdict/gaugeValue"
import { MatchedTermsList } from "../verdict/MatchedTermsList"
import { VerificationFindings } from "../verdict/VerificationFindings"
import { ConstraintNotice } from "../verdict/ConstraintNotice"
import { cn } from "cn"

export interface ProductIdentity {
  name: string
  brand?: string | null
  imageUrl?: string | null
  barcode?: string | null
  matchedBy: IdentityMatch
  /** Name-match score, present only on a catalogue match. Drives the match note. */
  similarity?: number
}

const MATCH_NOTE: Record<IdentityMatch, string> = {
  barcode: "Catalogue match by barcode",
  name: "Catalogue match by product name",
  none: "Provisional — not yet in the database",
}

/**
 * FR-2 splits name matches at 0.8: at or above it is a strong match, below it a
 * tentative one whose confidence is capped at Medium.
 *
 * The note has to say which one happened. A tentative match rendered with the
 * same wording — and the same green verified check — as a strong one reads as
 * "we have this exact product on file", which is a stronger claim than the score
 * supports.
 */
function matchNoteFor(match: IdentityMatch, similarity?: number): string {
  if (match === "name" && similarity !== undefined && similarity < NAME_MATCH_STRONG) {
    return `Tentative name match (${similarity.toFixed(2)}) — confirm this is the same product`
  }
  return MATCH_NOTE[match]
}

const RESULT_TITLE: Record<"gmo_food" | "oral_care", Record<string, string>> = {
  gmo_food: {
    low: "Low GMO likelihood",
    medium: "Medium GMO likelihood",
    high: "High GMO likelihood",
    none: "No GMO markers",
  },
  oral_care: {
    low: "Low Fluoride level",
    medium: "Medium Fluoride level",
    high: "High Fluoride level",
    none: "Fluoride-Free",
  },
}

export function DiagnosticResult({
  result,
  identity,
  photo,
  engineContext,
  onRescan,
  onAddProduct,
  onBack,
}: {
  result: EngineResult
  identity: ProductIdentity
  photo?: { blob: Blob; url: string } | null
  engineContext: EngineContext
  onRescan: () => void
  onAddProduct: () => void
  onBack: () => void
}) {
  const [saved, setSaved] = useState(false)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const verified = identity.matchedBy !== "none"
  // A match below FR-2's strong threshold is a different claim: we probably have
  // this product, not that we have THIS product. It must not wear the green
  // verified check, which is reserved for a strong name match (or a barcode hit,
  // which is exact by construction).
  const tentative =
    identity.matchedBy === "name" &&
    identity.similarity !== undefined &&
    identity.similarity < NAME_MATCH_STRONG
  const matchNote = matchNoteFor(identity.matchedBy, identity.similarity)
  const gaugeMetric = gaugeValue(result)
  // Use the engine's guidance only when it says something the constraint
  // notice doesn't already say. Older rows, and stored verdicts whose
  // guidance_text was blank, still fall back to the generic phrasing.
  const guidanceText =
    result.guidance && result.guidance !== result.constraintNotice
      ? result.guidance
      : null
  // FR-7 / 03_FRONTEND_ARCHITECTURE.md §3 item 7: a correction path must be
  // available whenever confidence is low — including when a STORED verdict
  // came back low-confidence. Previously submission was reachable only from the
  // no-catalogue-match path, so a verified product with low confidence offered
  // no way to dispute it at all.
  const lowConfidence = result.confidence.tier === "low"
  const title = result.category === "oral_care" && result.result.label === "No Data"
    ? "Insufficient label data"
    : RESULT_TITLE[result.category][result.result.tier]
  const categorySurface = result.category === "oral_care" ? "bg-accent-fluoride-soft/70" : "bg-accent-gmo-soft"
  const categoryText = result.category === "oral_care" ? "text-accent-fluoride" : "text-accent-gmo"
  const fluorideSummary = result.category === "oral_care" ? (
    <section aria-label="Fluoride result and confidence" className="flex flex-col items-center rounded-2xl bg-surface/75 px-4 pb-4 pt-4 shadow-xs">
      <ResultGauge tier={result.result.tier} value={gaugeMetric} className="size-36" />
      <h1 className="mt-2 text-center text-lg font-bold tracking-tight">{title}</h1>
      <ResultBadge tier={result.result.tier} label={result.result.label} />
      {!gaugeMetric && <p className="mt-2 text-caption text-muted-foreground">No numeric concentration was read from the label.</p>}
      <ConfidenceBadge tier={result.confidence.tier} factors={result.confidence.factors} />
    </section>
  ) : null

  const saveToHistory = async () => {
    // Persist a thumbnail data URL, not the photo's `blob:` object URL. Object
    // URLs are document-scoped: they are dead after any reload and are revoked
    // when the scan flow resets, so every saved-scan thumbnail was a broken
    // image that failed silently (those <img> are decorative, alt=""). A
    // thumbnail is optional — a failure here must not block the save.
    let imageUrl: string | null = null;
    if (photo?.blob) {
      try {
        imageUrl = await toThumbnailDataUrl(photo.blob);
      } catch {
        imageUrl = null;
      }
    }
    const scan: SavedScan = {
      id: `${result.category}-${result.computedAt}`,
      name: identity.name,
      brand: identity.brand ?? null,
      imageUrl,
      category: result.category,
      resultTier: result.result.tier,
      resultLabel: result.result.label,
      confidenceTier: result.confidence.tier,
      metric: gaugeMetric?.number ?? null,
      identityMatch: identity.matchedBy,
      savedAt: new Date().toISOString(),
    }
    saveScan(scan)
    setSaved(true)
    toast.success("Saved to My History", {
      description: `${identity.name} is now in your saved scans.`,
    })
  }

  const shareResult = async () => {
    const shareData = {
      title: `${title} · ${identity.name}`,
      text: `${title}. ${result.result.label}. ${result.constraintNotice}`,
      url: window.location.href,
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`)
        toast.success("Result link copied")
      } else {
        toast.error("Sharing isn’t available in this browser")
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        toast.error("Could not share this result")
      }
    }
  }

  return (
    <div className={cn("space-y-4", result.category === "oral_care" && "space-y-3")}>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" aria-label="Back" onClick={onBack}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Button>
        <h2 className="flex-1 text-label font-semibold">{result.category === "gmo_food" ? "Product Details" : "Diagnostic Result"}</h2>
        <Button type="button" variant="ghost" size="icon" aria-label="Share result" onClick={() => void shareResult()}>
          <Share2 className="size-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label={saved ? "Saved to history" : "Save to history"} onClick={() => void saveToHistory()}>
          <Bookmark className={cn("size-4", saved && "fill-current text-primary")} aria-hidden="true" />
        </Button>
      </div>

      {fluorideSummary}

      <Panel variant="elevated" padding="sm" className={cn("flex items-center gap-3 border-0", categorySurface)}>
        {photo?.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL; next/image can't optimize blob: URLs
          <img src={photo.url} alt={`Photo of ${identity.name}`} className="size-12 shrink-0 rounded-lg border border-white/70 object-cover" />
        ) : (
          <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface text-muted-foreground/60">
            <ImageIcon className="size-5" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-label font-semibold">{identity.name || "Unidentified product"}</h3>
          {identity.brand && <p className="truncate text-caption text-muted-foreground">{identity.brand}</p>}
          {gaugeMetric && <p className={cn("mt-1 truncate text-caption font-medium", categoryText)}>{gaugeMetric.number} {gaugeMetric.caption}</p>}
          {result.category === "gmo_food" && (
            <p className="mt-1 truncate text-[10px] text-muted-foreground">
              {matchNote}
            </p>
          )}
          <p
            className={cn(
              "mt-1 flex items-center gap-1 text-caption",
              tentative ? "text-warning" : verified ? "text-success" : "text-muted-foreground"
            )}
          >
            {verified && !tentative ? (
              <BadgeCheck className="size-3.5" aria-hidden="true" />
            ) : (
              <ImageIcon className="size-3.5" aria-hidden="true" />
            )}
            {matchNote}
          </p>
        </div>
      </Panel>

      {result.category === "gmo_food" && <section aria-label="Diagnostic result" className="flex flex-col items-center rounded-2xl bg-surface/75 px-4 pb-4 pt-3 shadow-xs">
        <ConfidenceBadge tier={result.confidence.tier} factors={result.confidence.factors} />
        <ResultGauge tier={result.result.tier} value={gaugeMetric} className="mt-3 size-32" />
        <ResultBadge tier={result.result.tier} label={result.result.label} />
        {!gaugeMetric && <p className="mt-2 text-caption text-muted-foreground">No numeric metric was read from the label</p>}
      </section>}

      <Panel variant="elevated" padding="md" className={cn("space-y-3 border-0", categorySurface)}>
        {result.category === "gmo_food" && (
          <div className="flex items-center justify-between gap-2">
            <Overline>Evidence breakdown</Overline>
            <span className="shrink-0 rounded-full bg-surface/80 px-2 py-1 text-[10px] font-medium text-muted-foreground">
              {result.matchedTerms.length} {result.matchedTerms.length === 1 ? "matched term" : "matched terms"}
            </span>
          </div>
        )}
        <VerificationFindings
          factors={result.confidence.factors}
          title={result.category === "oral_care" ? "Fluoride assessment factors" : "Verification Findings"}
        />
        {result.category === "gmo_food" && result.matchedTerms.length > 0 ? (
          <div>
            <p className="text-overline uppercase text-muted-foreground">Recognized label terms</p>
            <div className="mt-2"><MatchedTermsList terms={result.matchedTerms} /></div>
          </div>
        ) : result.category === "gmo_food" ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            No specific markers were recognized in the scanned text.
          </p>
        ) : null}
      </Panel>

      <Panel variant="elevated" padding="md" className={cn("space-y-2 border-0", result.result.tier === "high" ? "bg-destructive/10" : result.result.tier === "medium" ? "bg-warning/10" : "bg-success/10")}>
        <Overline>Why this result?</Overline>
        <p className="text-sm leading-relaxed">
          {/* Prefer the engine's own per-product guidance (GMO_Build_Guide.md
              §7/§8 "Why It Matters"), which names the crops and untraceable
              ingredients it actually found. Fall back to the generic phrasing
              only when guidance is missing or is just a restatement of the
              constraint notice — which is what the engine used to emit. */}
          {guidanceText ??
            (result.category === "gmo_food"
              ? gaugeMetric
                ? `The ruleset recognized ${gaugeMetric.number} ${gaugeMetric.caption} in the scanned label. This is a screening result, not confirmation of GMO content.`
                : `The rules engine classified recognized label terms as “${result.result.label}.” This screening cannot confirm GMO content.`
              : result.result.label === "No Data"
                ? "The scan could not reliably read an active fluoride ingredient or an explicit fluoride-free claim. Retake a clearer ingredient-label photo."
                : gaugeMetric
                ? `The scan read ${gaugeMetric.number} ${gaugeMetric.caption}. The published ruleset classifies the result as “${result.result.label}.”`
                : `The rules engine classified the recognized label terms as “${result.result.label}.” No numeric concentration was read from the label.`)}
        </p>
        <p className="text-caption text-muted-foreground">Ruleset v{result.configVersion}</p>
      </Panel>

      <ConstraintNotice notice={result.constraintNotice} />

      <Button type="button" size="lg" className="w-full" disabled={saved} onClick={() => void saveToHistory()}>
        <History className="size-4" aria-hidden="true" />
        {saved ? "Saved to My History" : "Save to My History"}
      </Button>

      <div>
        <Button type="button" variant="outline" className="w-full justify-between" aria-expanded={breakdownOpen} onClick={() => setBreakdownOpen((open) => !open)}>
          View Detailed Breakdown
          <ChevronDown className={cn("size-4 transition-transform", breakdownOpen && "rotate-180")} aria-hidden="true" />
        </Button>
        {breakdownOpen && (
          <Panel variant="inset" className="mt-2 space-y-3">
            <Overline>Scan details</Overline>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><dt className="text-muted-foreground">Product match</dt><dd>{matchNote}</dd></div>
              <div><dt className="text-muted-foreground">OCR confidence</dt><dd>{(engineContext.ocrMeanConfidence * 100).toFixed(0)}%</dd></div>
              <div><dt className="text-muted-foreground">Ingredient text truncated</dt><dd>{engineContext.isTruncated ? "Yes" : "No"}</dd></div>
              <div><dt className="text-muted-foreground">Computed</dt><dd>{new Date(result.computedAt).toLocaleTimeString()}</dd></div>
              <div><dt className="text-muted-foreground">Ruleset</dt><dd>v{result.configVersion}</dd></div>
            </dl>
          </Panel>
        )}
      </div>

      {!verified ? (
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" size="lg" onClick={onRescan}>Re-scan Product</Button>
          <Button type="button" size="lg" onClick={onAddProduct}>Add Product</Button>
        </div>
      ) : lowConfidence ? (
        // Prominent when confidence is low, per FR-7 — the user is being asked
        // to correct the record, and a wrong stored verdict must be disputable.
        <Button type="button" size="lg" className="w-full" onClick={onAddProduct}>
          Verify this with a human — submit a correction
        </Button>
      ) : (
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={onRescan}>Scan another product</Button>
      )}

      {verified && !lowConfidence && (
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={onAddProduct}>
          Something look wrong? Submit a correction
        </Button>
      )}
    </div>
  )
}
