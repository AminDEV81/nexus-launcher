interface PlaceholderPageProps {
  title: string
  epic: string
}

/**
 * Generic stand-in for routes whose real feature work lands in a later
 * Epic (e.g. Collections is routable now, in Epic 2, but its actual UI
 * is built in Epic 12). Keeps navigation fully wired end-to-end today
 * without pulling forward work that belongs to a different module.
 */
export function PlaceholderPage({ title, epic }: PlaceholderPageProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-xl font-semibold text-text">{title}</h1>
      <p className="text-sm text-muted">Coming in {epic}.</p>
    </div>
  )
}
