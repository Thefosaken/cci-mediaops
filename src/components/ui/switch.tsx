"use client"

import * as React from "react"
import { cn } from "@/lib/utils/cn"

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  id?: string
  className?: string
}

export function Switch({ checked, onChange, disabled, label, id, className }: SwitchProps) {
  const generatedId = React.useId()
  const switchId = id ?? generatedId

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      id={switchId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full",
        "border border-transparent transition-colors duration-200 ease-[var(--ease-out-quart)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-border-strong",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow",
          "transform transition-transform duration-200 ease-[var(--ease-out-quart)]",
          checked ? "translate-x-4" : "translate-x-0.5",
          "translate-y-[1px]"
        )}
      />
    </button>
  )
}
