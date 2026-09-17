import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16">
      <div className="space-y-8 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-zinc-400 dark:text-zinc-500">
          Scan · Read · Decide
        </p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight">
          Know what&apos;s on the label.
        </h1>
        <p className="mx-auto max-w-sm text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Photograph the front and back labels of a food or oral-care product.
          We extract the text and give you a clear likelihood verdict —
          with confidence, never proof.
        </p>
        <Link
          href="/scan"
          className="inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 text-base font-medium text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Start a scan
        </Link>
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          Works offline once the engine data is cached. No account needed.
        </p>
      </div>
    </main>
  );
}