export function LibrarySkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5 px-6 pb-6 pt-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <div className="aspect-[3/4] animate-pulse rounded-xl bg-surface-raised" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-surface-raised" />
          <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-raised" />
        </div>
      ))}
    </div>
  )
}
