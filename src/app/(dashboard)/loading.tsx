import { PageSkeleton } from "@/components/ui/page-skeleton"

/**
 * Covers the first paint into the dashboard shell. Sibling navigation is
 * handled by each route's own `loading.tsx` — this boundary does not re-fire
 * when only the child segment changes.
 */
export default function Loading() {
  return <PageSkeleton cards={4} rows={5} />
}
