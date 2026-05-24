import { cn } from "@/lib/utils/cn"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number
  height?: string | number
  circle?: boolean
}

export function Skeleton({
  className,
  width,
  height,
  circle,
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton", circle && "rounded-full", className)}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        ...style,
      }}
      {...props}
    />
  )
}

/** Pre-baked row skeleton — matches the rhythm of a table row. */
export function SkeletonRow({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 py-3 px-4 border-b border-border">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          className="flex-1"
          style={{ maxWidth: i === 0 ? 180 : i === columns - 1 ? 60 : 120 }}
        />
      ))}
    </div>
  )
}

/** Card skeleton — for dashboard summary cards. */
export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
      <Skeleton height={12} width={80} />
      <Skeleton height={28} width={120} />
      <Skeleton height={10} width="100%" />
    </div>
  )
}
