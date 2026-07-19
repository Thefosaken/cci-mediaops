import { Skeleton, SkeletonCard, SkeletonRow } from "@/components/ui/skeleton"

/**
 * The loading shape of a dashboard page: header, toolbar, then content.
 *
 * Shared so every route can have its own `loading.tsx` cheaply. That matters
 * more than it looks: a `loading.tsx` only opens a Suspense boundary for its
 * own segment, so the one at the `(dashboard)` group level never fires when you
 * move *between* sibling routes — the group segment isn't changing. Without a
 * per-route file the browser simply sits on the old page until the server
 * responds, which is what "not instantly responsive" feels like.
 *
 * `cards` and `rows` let a route match its real layout, so the skeleton settles
 * into content instead of jumping.
 */
export function PageSkeleton({
  cards = 0,
  rows = 6,
  toolbar = true,
}: {
  /** Summary cards above the content, if the page has them. */
  cards?: number
  /** Rows in the list below. */
  rows?: number
  toolbar?: boolean
}) {
  return (
    <div className="flex flex-col" aria-busy="true">
      <span className="sr-only">Loading…</span>

      <div className="flex items-center justify-between gap-3 border-b border-border bg-canvas px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center gap-3">
          <Skeleton width={36} height={36} />
          <div className="space-y-1.5">
            <Skeleton width={200} height={18} />
            <Skeleton width={300} height={11} />
          </div>
        </div>
        <Skeleton width={120} height={32} />
      </div>

      {toolbar && (
        <div className="flex items-center gap-2 border-b border-border bg-canvas px-5 py-3 sm:px-6">
          <Skeleton width={260} height={32} />
          <Skeleton width={150} height={32} />
        </div>
      )}

      <div className="space-y-4 px-5 py-6 sm:px-6">
        {cards > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: cards }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}
        {rows > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            {Array.from({ length: rows }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
