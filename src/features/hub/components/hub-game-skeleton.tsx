export function HubCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
      <div className="aspect-[3/4] w-full animate-pulse bg-surface-raised" />
      <div className="flex flex-col gap-2 p-3">
        <div className="h-4 w-3/4 animate-pulse rounded-md bg-surface-raised" />
        <div className="flex items-center justify-between">
          <div className="h-3 w-1/3 animate-pulse rounded-md bg-surface-raised" />
          <div className="h-3 w-10 animate-pulse rounded-md bg-surface-raised" />
        </div>
      </div>
    </div>
  )
}

export function HubFeedSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      {/* Featured Hero Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        <div className="h-[460px] sm:h-[500px] lg:col-span-8 lg:h-[510px] xl:col-span-9 animate-pulse rounded-3xl border border-border bg-surface" />
        <div className="hidden lg:flex lg:col-span-4 xl:col-span-3 flex-col justify-between gap-2">
          {Array.from({ length: 6 }, (_, idx) => (
            <div
              key={idx}
              className="h-16 w-full animate-pulse rounded-2xl border border-border/60 bg-surface/60"
            />
          ))}
        </div>
      </div>

      {/* Rows Skeletons */}
      {Array.from({ length: 3 }, (_, rowIndex) => (
        <div key={rowIndex} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="h-6 w-48 animate-pulse rounded-lg bg-surface" />
            <div className="h-4 w-16 animate-pulse rounded-md bg-surface" />
          </div>
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 6 }, (_, cardIndex) => (
              <div
                key={cardIndex}
                className="w-44 sm:w-48 lg:w-52 shrink-0 aspect-[3/4] animate-pulse rounded-2xl border border-border bg-surface"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function HubDetailsSkeleton() {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-7">
        {/* Navigation bar skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-9 w-32 animate-pulse rounded-xl bg-surface" />
          <div className="h-9 w-36 animate-pulse rounded-xl bg-surface" />
        </div>

        {/* Hero Section skeleton */}
        <div className="relative min-h-[460px] sm:min-h-[500px] lg:min-h-[540px] animate-pulse rounded-3xl border border-border bg-surface" />

        {/* Media Showcase skeleton */}
        <div className="h-64 animate-pulse rounded-3xl border border-border bg-surface" />

        {/* Details & Specs Grid skeleton */}
        <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr] xl:grid-cols-[2fr_1fr]">
          <div className="h-60 animate-pulse rounded-3xl border border-border bg-surface" />
          <div className="h-60 animate-pulse rounded-3xl border border-border bg-surface" />
        </div>
      </div>
    </div>
  )
}
