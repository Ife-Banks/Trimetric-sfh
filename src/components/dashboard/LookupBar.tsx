import { Search } from "lucide-react"

// Interactive optical barcode bar (Figma `bobby` 948:3209).
//
// A real search now, not a tap target. It is a plain GET form posting `q` back
// to the dashboard, so it works with JavaScript disabled and needs no client
// component: the server renders the matches.
//
// The design puts a camera glyph on the trailing button ("activate camera
// scanner"). That button now submits the query instead, because a button that
// looked like search while doing something else was the actual problem with this
// bar. Scanning is still one tap away — the hero CTA and the Scan tab both open
// the capture flow — so nothing was lost, only relabelled.
// `actionPath` is required rather than defaulted. The form is a plain GET, so it
// posts back to whatever route renders it — and when this screen moved from
// /guest-dashboard to /gmo, a hardcoded action sent the results to a route that
// does not render them. Making it explicit is what stops that recurring.
export function LookupBar({
  actionPath,
  initialQuery = "",
}: {
  actionPath: string
  initialQuery?: string
}) {
  return (
    <section aria-label="Lookup by code or name" className="rounded-md bg-surface p-4">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-[16px] font-semibold leading-6 text-primary">
          <Search className="size-4 shrink-0 text-gcheck-accent" aria-hidden="true" />
          Lookup by Code or Name
        </h2>
        <span className="ml-auto shrink-0 text-[11px] font-bold uppercase tracking-[0.04em] text-gcheck-body">
          UPC / EAN
        </span>
      </div>

      <form
        action={actionPath}
        method="get"
        role="search"
        className="mt-2 flex h-12 items-center gap-2 rounded-sm bg-gcheck-tint pr-1.5 pl-4"
      >
        <label htmlFor="catalogue-lookup" className="sr-only">
          Product name or barcode
        </label>
        <input
          id="catalogue-lookup"
          name="q"
          type="search"
          defaultValue={initialQuery}
          placeholder="Type cereal, brand, or paste barcode..."
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          aria-label="Search the catalogue"
          className="flex size-9 shrink-0 items-center justify-center rounded-[6px] bg-primary text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Search className="size-4" aria-hidden="true" />
        </button>
      </form>
    </section>
  )
}
