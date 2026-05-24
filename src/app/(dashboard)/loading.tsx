import { Skeleton, SkeletonCard, SkeletonRow } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col">
      {/* Page header */}
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

      {/* Toolbar */}
      <div className="border-b border-border bg-canvas px-5 py-3 sm:px-6 flex items-center gap-2">
        <Skeleton width={260} height={32} />
        <Skeleton width={150} height={32} />
      </div>

      {/* Body */}
      <div className="px-5 sm:px-6 py-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    </div>
  )
}
