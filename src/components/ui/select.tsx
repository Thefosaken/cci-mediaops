"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils/cn"
import { Check, ChevronDown, Search } from "lucide-react"

export interface SelectOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

interface SelectProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  searchable?: boolean
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

export function Select({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchable = false,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: SelectProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [focusedIndex, setFocusedIndex] = React.useState(-1)
  const [mounted, setMounted] = React.useState(false)
  const [dropdownPos, setDropdownPos] = React.useState<{
    top: number
    left: number
    width: number
    openUpward: boolean
    maxHeight: number
  } | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => { setMounted(true) }, [])

  const selected = options.find((o) => o.value === value)

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.description?.toLowerCase().includes(query.toLowerCase())
      )
    : options

  // Close on outside click — dropdown lives in a portal, so check both
  // the trigger container and the dropdown element.
  React.useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setOpen(false)
      setQuery("")
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  // Position the portaled dropdown against the trigger. Recompute on
  // scroll/resize so it tracks the trigger while open.
  React.useLayoutEffect(() => {
    if (!open) { setDropdownPos(null); return }
    function compute() {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const preferredHeight = 320 // matches max-h-72 + search row headroom
      const viewportPadding = 8 // breathing room from viewport edge
      const gap = 4 // gap between trigger and dropdown
      const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding
      const spaceAbove = rect.top - gap - viewportPadding
      // Prefer downward when it can show the full dropdown; otherwise pick the
      // side with more room so users never see a clipped, scroll-locked list.
      const openUpward = spaceBelow < preferredHeight && spaceAbove > spaceBelow
      const available = openUpward ? spaceAbove : spaceBelow
      const maxHeight = Math.max(120, Math.min(preferredHeight, available))
      setDropdownPos({
        top: openUpward ? rect.top : rect.bottom,
        left: rect.left,
        width: rect.width,
        openUpward,
        maxHeight,
      })
    }
    compute()
    window.addEventListener("scroll", compute, true)
    window.addEventListener("resize", compute)
    return () => {
      window.removeEventListener("scroll", compute, true)
      window.removeEventListener("resize", compute)
    }
  }, [open])

  // Auto-focus search when open
  React.useEffect(() => {
    if (!open) return
    if (searchable) {
      const t = setTimeout(() => searchRef.current?.focus(), 20)
      return () => clearTimeout(t)
    }
  }, [open, searchable])

  // Reset focused index when the dropdown opens or the query changes
  const prevOpenRef = React.useRef(open)
  React.useEffect(() => {
    if (open && !prevOpenRef.current) setFocusedIndex(-1)
    prevOpenRef.current = open
  }, [open])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    switch (e.key) {
      case "Enter":
      case " ":
        if (!open) { setOpen(true); break }
        if (focusedIndex >= 0 && filtered[focusedIndex]) {
          select(filtered[focusedIndex].value)
        }
        break
      case "Escape":
        setOpen(false)
        setQuery("")
        triggerRef.current?.focus()
        break
      case "ArrowDown":
        e.preventDefault()
        if (!open) { setOpen(true); break }
        setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1))
        break
      case "ArrowUp":
        e.preventDefault()
        if (!open) { setOpen(true); break }
        setFocusedIndex((i) => Math.max(i - 1, 0))
        break
      case "Tab":
        setOpen(false)
        setQuery("")
        break
    }
  }

  function select(val: string) {
    onChange(val)
    setOpen(false)
    setQuery("")
    triggerRef.current?.focus()
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", className)}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border border-border bg-canvas px-3 py-2",
          "text-sm transition-colors duration-150 text-left",
          "hover:border-border-strong",
          "focus-visible:outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-focus-ring/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-border-strong ring-2 ring-focus-ring/20"
        )}
      >
        <span className={cn("truncate", !selected && "text-faint")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-faint shrink-0 ml-2 transition-transform duration-150",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown — portaled so overflow:hidden/auto on any ancestor
          (scrollable Settings <main>, modal/side-panel wrappers, etc.)
          cannot clip it. Positioned with fixed coords against the trigger. */}
      {open && mounted && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          onKeyDown={handleKeyDown}
          style={{
            position: "fixed",
            top: dropdownPos.openUpward ? undefined : dropdownPos.top + 4,
            bottom: dropdownPos.openUpward
              ? window.innerHeight - dropdownPos.top + 4
              : undefined,
            left: dropdownPos.left,
            width: dropdownPos.width,
            minWidth: dropdownPos.width,
            maxHeight: dropdownPos.maxHeight,
            zIndex: 100,
          }}
          className={cn(
            "rounded-xl border border-border bg-surface-raised shadow-md",
            "animate-slide-up overflow-hidden flex flex-col"
          )}
        >
          {/* Search */}
          {searchable && (
            <div className="flex items-center border-b border-border px-3 py-2 gap-2">
              <Search className="h-3.5 w-3.5 text-faint shrink-0" aria-hidden="true" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setFocusedIndex(-1) }}
                placeholder="Search…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-faint focus:outline-none"
              />
            </div>
          )}

          {/* Options */}
          <ul
            ref={listRef}
            role="listbox"
            className="flex-1 min-h-0 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-faint">No results</li>
            ) : (
              filtered.map((option, idx) => {
                const isSelected = option.value === value
                const isFocused = idx === focusedIndex
                return (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled}
                    onClick={() => !option.disabled && select(option.value)}
                    onMouseEnter={() => setFocusedIndex(idx)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors duration-75",
                      "text-sm",
                      isFocused && !option.disabled && "bg-surface-subtle",
                      isSelected && "text-foreground",
                      !isSelected && "text-muted hover:text-foreground",
                      option.disabled && "cursor-not-allowed opacity-40"
                    )}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium truncate">{option.label}</span>
                      {option.description && (
                        <span className="block text-xs text-faint truncate mt-0.5">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <Check
                        className="h-3.5 w-3.5 text-primary shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </li>
                )
              })
            )}
          </ul>
        </div>,
        document.body
      )}
    </div>
  )
}
