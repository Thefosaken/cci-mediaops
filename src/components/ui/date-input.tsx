import * as React from "react"
import { cn } from "@/lib/utils/cn"
import { Calendar, Clock } from "lucide-react"

interface DateInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  type?: "date" | "datetime-local" | "time"
}

/**
 * A native date or time field, dressed to match the picker controls.
 *
 * Sized `h-10 rounded-lg bg-canvas` rather than following Input's `h-9 rounded-md`,
 * because this sits beside Select and DatePicker — the picker family — and a control
 * that is four pixels short of the one next to it reads as a mistake.
 *
 * The browser draws its own calendar/clock glyph inside the field. It cannot be
 * restyled, and in a dark theme it renders near-invisible against the surface, which
 * is how a date field ends up looking like it has no affordance at all. So the native
 * indicator is made transparent and stretched over the whole control: the field opens
 * the picker wherever you click it, and the only glyph anyone sees is the lucide icon
 * on the right, which does follow the theme.
 *
 * That hiding only holds because the global `::-webkit-calendar-picker-indicator`
 * rule lives in `@layer base`. Unlayered, it outranks every Tailwind utility and the
 * indicator reappears at half opacity in the middle of the field — which is exactly
 * the two-icon bug this control was written to avoid.
 *
 * Prefer the designed controls: DatePicker for dates, TimePicker for times. Both are
 * keyboard-driven, portaled, and look like the rest of the app in every browser. This
 * is the escape hatch for the rare case where a raw native field is genuinely wanted.
 */
const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, type = "date", ...props }, ref) => {
    const Icon = type === "time" ? Clock : Calendar

    return (
      <div className="relative w-full">
        <input
          ref={ref}
          type={type}
          className={cn(
            "relative flex h-10 w-full rounded-lg border border-border bg-canvas px-3 py-2 pr-9",
            "text-sm text-foreground",
            "transition-[border-color,box-shadow] duration-150",
            "hover:border-border-strong",
            "focus-visible:outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-focus-ring/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            // Keeps the typed value legible in both themes; the indicator below is
            // hidden regardless, so this only governs the text itself.
            "[color-scheme:light] dark:[color-scheme:dark]",
            // The whole control becomes the trigger, and the untheme-able native glyph
            // stops competing with the icon we actually draw.
            "[&::-webkit-calendar-picker-indicator]:absolute",
            "[&::-webkit-calendar-picker-indicator]:inset-0",
            "[&::-webkit-calendar-picker-indicator]:h-full",
            "[&::-webkit-calendar-picker-indicator]:w-full",
            "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
            "[&::-webkit-calendar-picker-indicator]:opacity-0",
            "[&::-webkit-calendar-picker-indicator]:[filter:none]",
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
