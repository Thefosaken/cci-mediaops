import * as React from "react"
import { cn } from "@/lib/utils/cn"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: {
    label: string
    onClick?: () => void
    href?: string
  }
  secondaryAction?: {
    label: string
    onClick?: () => void
    href?: string
  }
  variant?: "default" | "compact"
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant = "default",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "default"
          ? "rounded-xl border border-dashed border-border bg-surface py-16 px-6"
          : "py-10 px-4",
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-subtle border border-border text-faint [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </div>
      )}
      <p className="text-[14px] font-semibold text-foreground tracking-tight">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[13px] text-muted leading-snug">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex items-center gap-2">
          {action && (
            action.href ? (
              <a href={action.href}>
                <Button variant="primary" size="sm">{action.label}</Button>
              </a>
            ) : (
              <Button variant="primary" size="sm" onClick={action.onClick}>{action.label}</Button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <a href={secondaryAction.href}>
                <Button variant="ghost" size="sm">{secondaryAction.label}</Button>
              </a>
            ) : (
              <Button variant="ghost" size="sm" onClick={secondaryAction.onClick}>{secondaryAction.label}</Button>
            )
          )}
        </div>
      )}
    </div>
  )
}
