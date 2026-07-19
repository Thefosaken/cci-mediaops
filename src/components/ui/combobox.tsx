"use client"

import * as React from "react"
import { cn } from "@/lib/utils/cn"
import { Check, ChevronDown, Search, X } from "lucide-react"

export interface ComboboxOption {
  value: string
  label: string
  description?: string
}

interface ComboboxProps {
  id?: string
  values: string[]
  onChange: (values: string[]) => void
  options: ComboboxOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

export function Combobox({
  id,
  values,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const containerRef = React.useRef<HTMLDivElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.description?.toLowerCase().includes(query.toLowerCase())
      )
    : options

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  React.useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 20)
  }, [open])

  function toggle(val: string) {
    if (values.includes(val)) {
      onChange(values.filter((v) => v !== val))
    } else {
      onChange([...values, val])
    }
  }

  function removeChip(val: string, e: React.MouseEvent) {
    e.stopPropagation()
    onChange(values.filter((v) => v !== val))
  }

  function selectAll() {
    onChange(options.map((o) => o.value))
  }

  function clearAll() {
    onChange([])
  }

  const selectedLabels = values
    .map((v) => options.find((o) => o.value === v))
    .filter(Boolean) as ComboboxOption[]

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Trigger */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex min-h-10 w-full items-start flex-wrap gap-1.5 rounded-lg border border-border bg-canvas px-3 py-2",
          "text-sm transition-colors duration-150 text-left",
          "hover:border-border-strong",
          "focus-visible:outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-focus-ring/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-border-strong ring-2 ring-focus-ring/20"
        )}
      >
        {selectedLabels.length === 0 ? (
          <span className="text-faint py-0.5">{placeholder}</span>
        ) : (
          selectedLabels.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 rounded-md bg-surface-subtle border border-border px-2 py-0.5 text-xs font-medium text-foreground"
            >
              {opt.label}
              <button
                type="button"
                onClick={(e) => removeChip(opt.value, e)}
                aria-label={`Remove ${opt.label}`}
                className="rounded text-faint hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))
        )}
        <span className="ml-auto self-center">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-faint transition-transform duration-150",
              open && "rotate-180"
            )}
            aria-hidden="true"
          />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-surface-raised shadow-md animate-slide-up overflow-hidden">
          {/* Search */}
          <div className="flex items-center border-b border-border px-3 py-2 gap-2">
            <Search className="h-3.5 w-3.5 text-faint shrink-0" aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-faint focus:outline-none"
            />
          </div>

          {/* Bulk actions */}
          {options.length > 2 && (
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-muted hover:text-foreground transition-colors"
              >
                Select all
              </button>
              <span className="text-faint">·</span>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-muted hover:text-foreground transition-colors"
              >
                Clear
              </button>
              {values.length > 0 && (
                <span className="ml-auto text-xs text-faint">{values.length} selected</span>
              )}
            </div>
          )}

          {/* Options */}
          <ul role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-5 text-center text-sm text-faint">No results</li>
            ) : (
              filtered.map((option) => {
                const isSelected = values.includes(option.value)
                return (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggle(option.value)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors duration-75 text-sm",
                      "hover:bg-surface-subtle",
                      isSelected ? "text-foreground" : "text-muted hover:text-foreground"
                    )}
                  >
                    {/*
                      Presentational only: the row itself is the control, so a
                      nested input would be a second tab stop for the same
                      action. Sized and coloured to match the `Checkbox`
                      primitive so the two read as one component.
                    */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border",
                        "transition-[background-color,border-color] duration-[120ms] ease-out",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border-strong bg-canvas"
                      )}
                    >
                      <Check
                        className={cn(
                          "h-3 w-3 transition-[opacity,transform] duration-[120ms] ease-out",
                          isSelected ? "scale-100 opacity-100" : "scale-75 opacity-0"
                        )}
                        strokeWidth={3}
                      />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium truncate">{option.label}</span>
                      {option.description && (
                        <span className="block text-xs text-faint truncate">{option.description}</span>
                      )}
                    </span>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
