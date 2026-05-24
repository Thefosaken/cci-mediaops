import * as React from "react"
import { cn } from "@/lib/utils/cn"
import { Calendar, Clock } from "lucide-react"

interface DateInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  type?: "date" | "datetime-local" | "time"
}

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, type = "date", ...props }, ref) => {
    const Icon = type === "time" ? Clock : Calendar

    return (
      <div className="relative w-full">
        <input
          ref={ref}
          type={type}
          className={cn(
            "flex h-9 w-full rounded-md border border-border bg-surface px-3 py-2 pr-9",
            "text-sm text-foreground",
            "transition-[border-color,box-shadow] duration-150",
            "hover:border-border-strong",
            "focus-visible:outline-none focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "[color-scheme:light] dark:[color-scheme:dark]",
            className
          )}
          {...props}
        />
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
    )
  }
)
DateInput.displayName = "DateInput"

export { DateInput }
