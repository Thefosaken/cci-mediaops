import * as React from "react"
import { cn } from "@/lib/utils/cn"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "muted"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide",
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
    />
  )
}

export { Badge }
export type { BadgeProps }
