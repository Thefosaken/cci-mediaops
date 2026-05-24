import * as React from "react"
import { cn } from "@/lib/utils/cn"

type BadgeVariant =
  | "default"
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted"
  | "outline"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  dot?: boolean
  size?: "sm" | "default"
}

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-primary",
  neutral: "bg-foreground",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  muted: "bg-muted",
  outline: "bg-muted",
}

function Badge({
  className,
  variant = "neutral",
  dot,
  size = "default",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-medium tracking-tight whitespace-nowrap",
        size === "sm"
          ? "px-1.5 py-0.5 text-[10.5px]"
          : "px-2 py-0.5 text-[11.5px]",
        {
          "bg-primary-soft text-primary": variant === "default",
          "bg-surface-subtle text-foreground border border-border": variant === "neutral",
          "bg-success-soft text-success": variant === "success",
          "bg-warning-soft text-warning": variant === "warning",
          "bg-danger-soft text-danger": variant === "danger",
          "bg-info-soft text-info": variant === "info",
          "bg-surface-subtle text-muted": variant === "muted",
          "bg-transparent text-muted border border-border": variant === "outline",
        },
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotColors[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}

/** Stand-alone colored dot for status indicators in tables/rows. */
function StatusDot({
  variant = "muted",
  pulse,
  className,
}: {
  variant?: BadgeVariant
  pulse?: boolean
  className?: string
}) {
  return (
    <span className="relative inline-flex items-center justify-center" aria-hidden="true">
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-2 w-2 rounded-full opacity-60 animate-ping",
            dotColors[variant]
          )}
        />
      )}
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[variant], className)} />
    </span>
  )
}

export { Badge, StatusDot }
export type { BadgeProps, BadgeVariant }
