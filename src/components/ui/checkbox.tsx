"use client"

import * as React from "react"
import { Check, Minus } from "lucide-react"
import { cn } from "@/lib/utils/cn"

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Text beside the box. Omit for a bare box inside a row that labels itself. */
  label?: React.ReactNode
  /** Secondary line under the label. */
  description?: React.ReactNode
  /** Neither checked nor unchecked — a partially selected group. */
  indeterminate?: boolean
}

/**
 * The app's checkbox.
 *
 * A real `<input type="checkbox">` is kept in the DOM and visually hidden — it
 * carries focus, keyboard behaviour, form participation, and the accessibility
 * tree — while the visible box is a styled sibling driven by `peer-*` variants.
 * Browsers do not style native checkboxes consistently (and barely style them
 * at all in dark mode), which is why unstyled ones read as foreign here.
 *
 * Sizes follow the design system: 16px box, `radius-xs`, 44px minimum target on
 * the label row.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ className, label, description, indeterminate, disabled, ...props }, ref) {
    const innerRef = React.useRef<HTMLInputElement>(null)

    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement)

    // `indeterminate` is a DOM property with no HTML attribute — it can only be
    // set imperatively.
    React.useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = Boolean(indeterminate)
    }, [indeterminate])

    return (
      <label
        className={cn(
          "group inline-flex items-start gap-2.5 py-1.5",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          className
        )}
      >
        <span className="flex h-5 shrink-0 items-center">
          <input
            ref={innerRef}
            type="checkbox"
            disabled={disabled}
            className="peer sr-only"
            {...props}
          />
          <span
            aria-hidden="true"
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded-[4px] border text-primary-foreground",
              "border-border-strong bg-canvas",
              "transition-[background-color,border-color] duration-[120ms] ease-out",
              "peer-checked:border-primary peer-checked:bg-primary",
              "peer-indeterminate:border-primary peer-indeterminate:bg-primary",
              !disabled && "group-hover:border-primary/60",
              // The ring goes on the visible box because the real input is
              // `sr-only` and has no paintable box of its own.
              "peer-focus-visible:ring-2 peer-focus-visible:ring-focus-ring/40 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-canvas",
              // The glyph is a *descendant* of this box, not a sibling of the
              // input, so `peer-checked:` cannot target it directly — Tailwind's
              // peer variants only reach siblings. Driving it from here, where
              // the sibling relationship does hold, is what makes it work.
              "[&_svg]:scale-75 [&_svg]:opacity-0",
              "[&_svg]:transition-[opacity,transform] [&_svg]:duration-[120ms] [&_svg]:ease-out",
              "peer-checked:[&_svg]:scale-100 peer-checked:[&_svg]:opacity-100",
              "peer-indeterminate:[&_svg]:scale-100 peer-indeterminate:[&_svg]:opacity-100"
            )}
          >
            {indeterminate ? (
              <Minus className="h-3 w-3" strokeWidth={3} />
            ) : (
              <Check className="h-3 w-3" strokeWidth={3} />
            )}
          </span>
        </span>

        {(label || description) && (
          <span className="min-w-0 flex-1">
            {label && <span className="block text-[13px] text-foreground">{label}</span>}
            {description && (
              <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">{description}</span>
            )}
          </span>
        )}
      </label>
    )
  }
)
