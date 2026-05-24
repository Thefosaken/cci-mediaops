import * as React from "react"
import { cn } from "@/lib/utils/cn"

const Spinner = ({ className }: { className?: string }) => (
  <svg
    className={cn("h-3.5 w-3.5 animate-spin", className)}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
  </svg>
)

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "link"
type ButtonSize = "xs" | "sm" | "default" | "lg"

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
    size?: ButtonSize
    loading?: boolean
    fullWidth?: boolean
  }
>(({ className, variant = "primary", size = "default", loading, fullWidth, children, disabled, ...props }, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap select-none cursor-pointer",
        "transition-[background,color,border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-quart)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus-ring focus-visible:ring-offset-canvas",
        "disabled:pointer-events-none disabled:opacity-50",
        "active:scale-[0.98]",
        fullWidth && "w-full",
        {
          // Primary — brand red, white text
          "bg-primary text-white border border-primary shadow-sm hover:bg-primary-dark hover:border-primary-dark":
            variant === "primary",
          // Secondary — neutral, the most common workhorse
          "bg-surface text-foreground border border-border shadow-sm hover:bg-surface-hover hover:border-border-strong":
            variant === "secondary",
          // Outline — same as secondary but no shadow, used inside cards
          "bg-transparent text-foreground border border-border hover:bg-surface-subtle hover:border-border-strong":
            variant === "outline",
          // Ghost — quiet, for row actions and headers
          "text-muted hover:text-foreground hover:bg-surface-subtle border border-transparent":
            variant === "ghost",
          // Danger
          "bg-danger text-white border border-danger shadow-sm hover:opacity-90":
            variant === "danger",
          // Link — pure text, underlined on hover
          "text-foreground hover:text-primary underline-offset-4 hover:underline border-0 px-0 h-auto":
            variant === "link",
        },
        variant !== "link" && {
          "h-7 px-2.5 text-xs rounded-md gap-1.5": size === "xs",
          "h-8 px-3 text-[13px] rounded-md gap-1.5": size === "sm",
          "h-9 px-3.5 text-sm rounded-md gap-2": size === "default",
          "h-10 px-4 text-[15px] rounded-lg gap-2": size === "lg",
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

/** Square icon-only button. */
const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: ButtonSize
    variant?: "ghost" | "secondary" | "outline"
    label: string
  }
>(({ className, size = "default", variant = "ghost", label, children, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center shrink-0 cursor-pointer select-none",
        "transition-[background,color,border-color,transform] duration-150 ease-[var(--ease-out-quart)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus-ring focus-visible:ring-offset-canvas",
        "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.94]",
        {
          "text-muted hover:text-foreground hover:bg-surface-subtle border border-transparent":
            variant === "ghost",
          "bg-surface text-foreground border border-border hover:bg-surface-hover hover:border-border-strong shadow-sm":
            variant === "secondary",
          "bg-transparent text-foreground border border-border hover:bg-surface-subtle hover:border-border-strong":
            variant === "outline",
        },
        {
          "h-7 w-7 rounded-md": size === "xs",
          "h-8 w-8 rounded-md": size === "sm",
          "h-9 w-9 rounded-md": size === "default",
          "h-10 w-10 rounded-lg": size === "lg",
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
})
IconButton.displayName = "IconButton"

export { Button, IconButton }
