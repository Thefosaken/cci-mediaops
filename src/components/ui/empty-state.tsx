import * as React from "react"
import { cn } from "@/lib/utils/cn"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface py-14 px-6 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-subtle text-faint">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm text-muted">{description}</p>
      )}
      {action && (
        <div className="mt-5">
          <Button variant="secondary" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  )
}
