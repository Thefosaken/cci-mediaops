import * as React from "react"
import { cn } from "@/lib/utils/cn"

interface FormFieldProps {
  id?: string
  label: string
  required?: boolean
  helper?: string
  error?: string
  children: React.ReactNode
  className?: string
}

/**
 * Wraps a form control with a label, optional helper text, and error state.
 * Standardises spacing across all forms. Pass a single interactive child.
 */
export function FormField({
  id,
  label,
  required,
  helper,
  error,
  children,
  className,
}: FormFieldProps) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`

  // Clone child to inject id and aria-describedby if it's a single element
  const child = React.Children.only(children)
  const enriched = React.isValidElement(child)
    ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
        id: (child as React.ReactElement<Record<string, unknown>>).props.id ?? fieldId,
        "aria-describedby": error ? errorId : undefined,
        "aria-invalid": error ? true : undefined,
      })
    : child

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={fieldId}
        className="text-xs font-semibold text-foreground tracking-wide uppercase"
        style={{ letterSpacing: "0.04em" }}
      >
        {label}
        {required && (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {enriched}
      {helper && !error && (
        <p className="text-xs text-faint leading-snug">{helper}</p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger leading-snug flex items-center gap-1">
          <span aria-hidden="true">↑</span> {error}
        </p>
      )}
    </div>
  )
}
