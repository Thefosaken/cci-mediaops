import * as React from "react"
import { cn } from "@/lib/utils/cn"

/**
 * Sticky toolbar above a list — search + filters left, primary action right.
 * Linear pattern. Sits flush against the page header.
 */
export function Toolbar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-border bg-canvas px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6",
        className
      )}
    >
      {children}
    </div>
  )
}

export function ToolbarGroup({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {children}
    </div>
  )
}

/**
 * Vertical separator for use inside toolbars.
 */
export function ToolbarDivider() {
  return <span className="h-4 w-px bg-border shrink-0" aria-hidden="true" />
}
