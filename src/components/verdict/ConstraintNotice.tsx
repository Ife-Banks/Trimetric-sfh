// ConstraintNotice — the honesty statement. ALWAYS rendered on every GMO
// verdict and NEVER dismissible (06_AGENT_CONTEXT.md §2.2, 01_TECHNICAL_SPEC
// FR-1). There is deliberately no close button: the constraint is not optional
// UI that users can shrug away.

export function ConstraintNotice({ notice }: { notice: string }) {
  return (
    <aside
      role="note"
      aria-label="Constraint notice"
      className="flex items-start gap-3 rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
      <p>{notice}</p>
    </aside>
  )
}