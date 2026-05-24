import * as React from "react"
import { cn } from "@/lib/utils/cn"

const Spinner = () => (
  <svg
    className="h-4 w-4 animate-spin"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
  </svg>
)

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger" | "icon"
    size?: "sm" | "default" | "lg"
    loading?: boolean
  }
>(({ className, variant = "primary", size = "default", loading, children, disabled, ...props }, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus-ring",
        "disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
        "active:scale-[0.96] active:brightness-95",
        {
          // Primary
          "bg-primary text-white border border-primary hover:bg-primary-dark":
            variant === "primary",
          // Secondary
          "bg-surface text-foreground border border-border hover:bg-surface-subtle hover:border-border-strong":
            variant === "secondary",
          // Ghost
          "text-muted hover:text-foreground hover:bg-surface-subtle border border-transparent":
            variant === "ghost",
          // Danger
          "bg-danger text-white border border-danger hover:opacity-90":
            variant === "danger",
          // Icon
          "text-muted hover:text-foreground hover:bg-surface-subtle border border-transparent aspect-square p-0":
            variant === "icon",
        },
        {
          "h-8 px-3 text-xs rounded-lg gap-1.5": size === "sm",
          "h-10 px-4 text-sm rounded-lg gap-2": size === "default",
          "h-11 px-5 text-[15px] rounded-lg gap-2": size === "lg",
          // Icon size overrides
          "h-8 w-8 rounded-lg": variant === "icon" && size === "sm",
          "h-9 w-9 rounded-lg": variant === "icon" && size === "default",
          "h-10 w-10 rounded-lg": variant === "icon" && size === "lg",
        },
        className
      )}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
})
Button.displayName = "Button"

export { Button }
