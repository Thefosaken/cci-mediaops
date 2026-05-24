import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="w-full max-w-[380px] mx-auto py-10">
      <div className="space-y-3 mb-7">
        <Skeleton width={160} height={22} />
        <Skeleton width={280} height={13} />
      </div>
      <div className="space-y-4">
        <Skeleton width="100%" height={36} />
        <Skeleton width="100%" height={36} />
        <Skeleton width="100%" height={40} />
      </div>
    </div>
  )
}
