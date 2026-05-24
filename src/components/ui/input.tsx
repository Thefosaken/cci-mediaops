import * as React from "react"
import { cn } from "@/lib/utils/cn"

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    leadingIcon?: React.ReactNode
    trailingIcon?: React.ReactNode
  }
>(({ className, type = "text", leadingIcon, trailingIcon, ...props }, ref) => {
  if (leadingIcon || trailingIcon) {
    return (
      <div className="relative w-full">
        {leadingIcon && (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint [&>svg]:h-4 [&>svg]:w-4">
            {leadingIcon}
          </div>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            "flex h-9 w-full rounded-md border border-border bg-surface px-3 py-2",
            "text-sm text-foreground placeholder:text-faint",
            "transition-[border-color,box-shadow] duration-150",
            "hover:border-border-strong",
            "focus-visible:outline-none focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/20",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium",
            leadingIcon && "pl-9",
            trailingIcon && "pr-9",
            className
          )}
          {...props}
        />
        {trailingIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-faint [&>svg]:h-4 [&>svg]:w-4">
            {trailingIcon}
          </div>
        )}
      </div>
    )
  }
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-border bg-surface px-3 py-2",
        "text-sm text-foreground placeholder:text-faint",
        "transition-[border-color,box-shadow] duration-150",
        "hover:border-border-strong",
        "focus-visible:outline-none focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/20",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className
      )}
      {...props}
    />
  )
})
Input.displayName = "Input"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 4, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "flex w-full rounded-md border border-border bg-surface px-3 py-2",
        "text-sm text-foreground placeholder:text-faint resize-y min-h-[88px]",
        "transition-[border-color,box-shadow] duration-150",
        "hover:border-border-strong",
        "focus-visible:outline-none focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/20",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border",
        className
      )}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Input, Textarea }
