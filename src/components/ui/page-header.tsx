import * as React from "react"
import { cn } from "@/lib/utils/cn"

interface PageHeaderProps {
  title: string
  description?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
  badge?: React.ReactNode
  className?: string
}

/**
 * Consistent page header used across every dashboard route.
 * Linear-style: tight, monochrome, title left + actions right.
 */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  badge,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border bg-canvas px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5",
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface border border-border text-muted [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground leading-tight truncate">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="text-[13px] text-muted leading-snug mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  )
}

/** Lightweight section header for sub-sections within a page. */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">
          {title}
        </h2>
        {description && (
          <p className="text-[13px] text-muted leading-snug mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
