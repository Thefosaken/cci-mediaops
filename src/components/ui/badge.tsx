import * as React from "react"
import { cn } from "@/lib/utils/cn"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "muted"
  dot?: boolean
}

const dotColors: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  muted: "bg-muted",
}

function Badge({ className, variant = "default", dot, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide capitalize",
        {
          "bg-primary-soft text-primary": variant === "default",
          "bg-success-soft text-success": variant === "success",
          "bg-warning-soft text-warning": variant === "warning",
          "bg-danger-soft text-danger": variant === "danger",
          "bg-info-soft text-info": variant === "info",
          "bg-surface-subtle text-muted": variant === "muted",
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

export { Badge }
export type { BadgeProps }
