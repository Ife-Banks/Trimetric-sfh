// Greeting row for the hub (Figma `Untitled`, frame 1:1261).
//
// The design greets a hardcoded "Alex". This uses whoever is actually signed in,
// and says something different for a guest rather than pretending they have an
// account — an anonymous user is a supported way to use the app, not a degraded
// one.
export function HubGreeting({
  displayName,
  isMember,
}: {
  displayName: string
  isMember: boolean
}) {
  const firstName = displayName.trim().split(/\s+/)[0] ?? ""
  const initial = firstName.charAt(0).toUpperCase()

  return (
    <section className="flex items-center gap-3" aria-label="Greeting">
      <span
        className="grid size-12 shrink-0 place-items-center rounded-full bg-gcheck-tint text-[16px] font-bold text-primary"
        aria-hidden="true"
      >
        {initial || "M"}
      </span>
      <div className="min-w-0">
        <h2 className="truncate text-[16px] font-bold leading-5 tracking-[-0.2px] text-foreground">
          {firstName ? `Hello, ${firstName}!` : "Hello!"}
        </h2>
        <p className="mt-0.5 truncate text-[12px] leading-4 text-gcheck-body">
          {isMember ? "Your wellness guardian is active" : "Scan without an account"}
        </p>
      </div>
    </section>
  )
}
