import * as React from "react"
import { cn } from "@/lib/utils/cn"

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger"
    size?: "sm" | "default" | "lg"
  }
>(({ className, variant = "primary", size = "default", ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:opacity-50 select-none",
        {
          "bg-primary text-white border border-primary hover:bg-primary-dark active:scale-[0.97]": variant === "primary",
          "bg-surface text-foreground border border-border hover:bg-surface-subtle hover:border-border-strong active:scale-[0.97]": variant === "secondary",
          "text-muted hover:text-foreground hover:bg-surface-subtle active:scale-[0.97]": variant === "ghost",
          "bg-danger text-white border border-danger hover:opacity-90 active:scale-[0.97]": variant === "danger",
        },
        {
          "h-9 px-3 text-xs rounded-md gap-1.5": size === "sm",
          "h-10 px-4 text-sm rounded-lg gap-2": size === "default",
          "h-12 px-5 text-[15px] rounded-lg gap-2": size === "lg",
        },
        className
      )}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button }
