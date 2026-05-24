import * as React from "react"
import { cn } from "@/lib/utils/cn"

interface FormFieldProps {
  id?: string
  label: string
  required?: boolean
  helper?: string
  error?: string
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * Wraps a form control with label, optional helper text, and error state.
 * Linear/Vercel pattern: sentence-case label, small text, error inline below.
 */
export function FormField({
  id,
  label,
  required,
  helper,
  error,
  hint,
  children,
  className,
}: FormFieldProps) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`
  const helperId = `${fieldId}-helper`

  const child = React.Children.only(children)
  const enriched = React.isValidElement(child)
    ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
        id: (child as React.ReactElement<Record<string, unknown>>).props.id ?? fieldId,
        "aria-describedby": [error ? errorId : null, helper ? helperId : null]
          .filter(Boolean)
          .join(" ") || undefined,
        "aria-invalid": error ? true : undefined,
      })
    : child

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={fieldId}
          className="text-[13px] font-medium text-foreground"
        >
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
        {hint && <span className="text-[11.5px] text-faint">{hint}</span>}
      </div>
      {enriched}
      {helper && !error && (
        <p id={helperId} className="text-[12px] text-faint leading-snug">
          {helper}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[12px] text-danger leading-snug">
          {error}
        </p>
      )}
    </div>
  )
}
