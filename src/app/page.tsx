import Link from "next/link";
import { Leaf, ScanLine, ShieldCheck, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { ResultBadge } from "@/components/verdict/ResultBadge";
import { ConfidenceBadge } from "@/components/verdict/ConfidenceBadge";

export default function Home() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-12 outline-none"
    >
      <div className="space-y-8 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-muted-foreground">
          Scan · Read · Decide
        </p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight">
          Know what&apos;s on the label.
        </h1>
        <p className="mx-auto max-w-sm text-base leading-relaxed text-muted-foreground">
          Photograph the front and back labels of a food or oral-care product.
          We extract the text and give you a clear likelihood verdict —
          with confidence, never proof.
        </p>

        <Panel variant="elevated" className="mx-auto max-w-sm space-y-4 p-5 text-left">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Leaf className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                Coconut milk, unsweetened
              </p>
              <p className="text-xs text-muted-foreground">Ingredients · front label</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ResultBadge tier="low" label="Low GMO likelihood" />
            <ConfidenceBadge
              tier="high"
              factors={[
                "OCR confidence on the ingredient list was high",
                "Ingredients matched a verified stored product",
              ]}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Two separate badges, always: the verdict and its confidence are never merged.
          </p>
        </Panel>

        <div className="space-y-4">
          <Button asChild size="lg" className="h-12 rounded-full px-8 text-base">
            <Link href="/scan">Start a scan</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            No account needed. Works offline once the engine data is cached.
          </p>
          <ul className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-x-1 gap-y-2 divide-x divide-border text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5 px-3">
              <ScanLine className="size-4" aria-hidden="true" />
              Front + back labels
            </li>
            <li className="flex items-center gap-1.5 px-3">
              <WifiOff className="size-4" aria-hidden="true" />
              Works offline
            </li>
            <li className="flex items-center gap-1.5 px-3">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Human-reviewed corrections
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}