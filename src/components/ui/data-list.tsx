import * as React from "react"
import { cn } from "@/lib/utils/cn"

/**
 * Definition-list style key/value rows for side panel details.
 * Linear/Vercel pattern: label left (muted), value right, no heavy borders.
 */
interface DataListProps {
  children: React.ReactNode
  className?: string
}

export function DataList({ children, className }: DataListProps) {
  return (
    <dl className={cn("divide-y divide-border", className)}>{children}</dl>
  )
}

interface DataItemProps {
  label: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function DataItem({ label, children, className }: DataItemProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[110px_1fr] gap-4 py-2.5 items-start",
        className
      )}
    >
      <dt className="text-[12.5px] font-medium text-faint pt-0.5">{label}</dt>
      <dd className="text-[13px] text-foreground min-w-0 break-words">
        {children || <span className="text-faint italic">Not set</span>}
      </dd>
    </div>
  )
}
