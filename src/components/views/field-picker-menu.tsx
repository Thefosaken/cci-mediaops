"use client"

import * as React from "react"
import { Check, Search } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import type { FieldDef } from "@/lib/views/types"

import { FieldIcon } from "./field-icon"
import { ViewPopover, focusRing, focusWithinField } from "./view-popover"

interface FieldListProps<T> {
  fields: FieldDef<T>[]
  /** Ids rendered with a check mark. */
  checkedIds?: string[]
  /** Ids that cannot be toggled (e.g. the primary field is always visible). */
  disabledIds?: string[]
  /** Multi keeps the list open after a pick; single closes via `onPick`. */
  multi?: boolean
  onPick: (fieldId: string) => void
  autoFocus?: boolean
  emptyLabel?: string
  className?: string
}

/**
 * Searchable field list. Shared body for the group-by picker, the hide-fields
 * checkbox list, and the "add rule" step inside the filter and sort menus.
 *
 * Filter input focuses on open, arrow keys move the active row, Enter picks it.
 */
export function FieldList<T>({
  fields,
  checkedIds = [],
  disabledIds = [],
  multi = false,
  onPick,
  autoFocus = true,
  emptyLabel = "No fields",
  className
}: FieldListProps<T>) {
  const [query, setQuery] = React.useState("")
  const [active, setActive] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)

  React.useEffect(() => {
    if (!autoFocus) return
    const t = setTimeout(() => inputRef.current?.focus(), 20)
    return () => clearTimeout(t)
  }, [autoFocus])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return fields
    return fields.filter((f) => f.label.toLowerCase().includes(q))
  }, [fields, query])

  // Keep the active row in view while arrowing through a long field list.
  React.useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest" })
  }, [active])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const field = filtered[active]
      if (field && !disabledIds.includes(field.id)) onPick(field.id)
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)} onKeyDown={handleKeyDown}>
      {/* Focus lives on this row, not the input — see `focusWithinField`. The
          12px inset matches the rows below (their `p-1` list + `px-2`). */}
      <div
        className={cn(
          "group flex h-9 shrink-0 items-center gap-2 border-b border-border px-3",
          "transition-colors duration-[120ms] ease-out",
          focusWithinField
        )}
      >
        <Search
          className="h-4 w-4 shrink-0 text-faint transition-colors duration-[120ms] ease-out group-focus-within:text-muted"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0) }}
          placeholder="Search fields…"
          aria-label="Search fields"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-faint"
        />
      </div>

      <ul
        ref={listRef}
        role="listbox"
        aria-multiselectable={multi || undefined}
        className="min-h-0 flex-1 overflow-y-auto p-1"
      >
        {filtered.length === 0 ? (
          <li className="px-2 py-6 text-center text-[13px] text-faint">{emptyLabel}</li>
        ) : (
          filtered.map((field, idx) => {
            const checked = checkedIds.includes(field.id)
            const disabled = disabledIds.includes(field.id)
            return (
              <li key={field.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={checked}
                  disabled={disabled}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => onPick(field.id)}
                  className={cn(
                    // 28px rows (32px under `sm`, where they get tapped): eleven
                    // fields then fit in one view instead of a ~500px column.
                    "flex h-8 w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 text-left text-[13px] sm:h-7",
                    "transition-colors duration-100 ease-out",
                    focusRing,
                    idx === active && !disabled && "bg-surface-subtle",
                    checked ? "text-foreground" : "text-muted",
                    disabled && "cursor-not-allowed opacity-45"
                  )}
                >
                  <FieldIcon name={field.icon} type={field.type} className="text-faint" />
                  <span className="min-w-0 flex-1 truncate">{field.label}</span>
                  {/* Trailing, in a reserved 16px slot: the checks line up in a
                      single column the eye can scan, and because the space is
                      held whether or not the row is checked, labels never shift
                      as selection changes. */}
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {checked && <Check className="h-4 w-4 text-primary" aria-hidden />}
                  </span>
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

interface FieldPickerMenuProps<T> {
  open: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
  label: string
  fields: FieldDef<T>[]
  checkedIds?: string[]
  disabledIds?: string[]
  multi?: boolean
  onPick: (fieldId: string) => void
  /** Rendered under the list — e.g. the "Remove group by" row. */
  footer?: React.ReactNode
  align?: "start" | "end"
}

/** Field list in a portaled popover. Used by Group by and Hide fields. */
export function FieldPickerMenu<T>({
  open,
  onClose,
  triggerRef,
  label,
  fields,
  checkedIds,
  disabledIds,
  multi,
  onPick,
  footer,
  align = "start"
}: FieldPickerMenuProps<T>) {
  return (
    <ViewPopover
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      label={label}
      align={align}
      width={256}
    >
      <FieldList
        fields={fields}
        checkedIds={checkedIds}
        disabledIds={disabledIds}
        multi={multi}
        onPick={(id) => {
          onPick(id)
          if (!multi) onClose()
        }}
      />
      {footer && <div className="border-t border-border p-1">{footer}</div>}
    </ViewPopover>
  )
}
