"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import type { FieldDef, SortRule } from "@/lib/views/types"

import { FieldIcon } from "./field-icon"
import { FieldList } from "./field-picker-menu"
import { PopoverRow, ViewPopover, focusRing } from "./view-popover"

interface SortMenuProps<T> {
  open: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
  fields: FieldDef<T>[]
  sorts: SortRule[]
  onAdd: (rule: SortRule) => void
  onUpdate: (index: number, rule: SortRule) => void
  onRemove: (index: number) => void
  align?: "start" | "end"
}

/** Builds and edits `SortRule[]` — one removable row per rule, asc/desc toggle. */
export function SortMenu<T>({
  open,
  onClose,
  triggerRef,
  fields,
  sorts,
  onAdd,
  onUpdate,
  onRemove,
  align = "start"
}: SortMenuProps<T>) {
  return (
    <ViewPopover
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      label="Sort"
      align={align}
      width={288}
      maxHeight={420}
    >
      {/* Mounted only while open, so the add/edit step resets on every open
          without a state-syncing effect. */}
      <SortMenuBody
        fields={fields}
        sorts={sorts}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    </ViewPopover>
  )
}

type SortMenuBodyProps<T> = Pick<
  SortMenuProps<T>,
  "fields" | "sorts" | "onAdd" | "onUpdate" | "onRemove"
>

function SortMenuBody<T>({
  fields,
  sorts,
  onAdd,
  onUpdate,
  onRemove
}: SortMenuBodyProps<T>) {
  const [adding, setAdding] = React.useState(sorts.length === 0)

  const sortable = React.useMemo(
    () => fields.filter((f) => f.sortable !== false && f.sortValue),
    [fields]
  )

  // Sorting by the same field twice is meaningless — the second rule never runs.
  const available = React.useMemo(
    () => sortable.filter((f) => !sorts.some((s) => s.fieldId === f.id)),
    [sortable, sorts]
  )

  return (
    <>
      {adding ? (
        <FieldList
          fields={available}
          onPick={(fieldId) => {
            onAdd({ fieldId, direction: "asc" })
            setAdding(false)
          }}
          emptyLabel="No fields left to sort by"
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {sorts.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] text-faint">No sorting yet</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sorts.map((rule, index) => {
                  const field = fields.find((f) => f.id === rule.fieldId)
                  if (!field) return null
                  return (
                    <li
                      key={`${rule.fieldId}-${index}`}
                      className="flex items-center gap-2 rounded-md border border-border bg-surface p-2"
                    >
                      <FieldIcon name={field.icon} type={field.type} className="text-faint" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                        {field.label}
                      </span>

                      {/* 28px overall: a 2px inset around two 24px segments. The
                          inset is the one sub-4px value here — it is the frame
                          of the control, not spacing between elements. The
                          arrows are 14px rather than §15's 16px because 16px
                          leaves no air inside a 24px segment. */}
                      <div
                        className="flex shrink-0 items-center rounded-md border border-border bg-surface-subtle p-0.5"
                        role="group"
                        aria-label={`Sort direction for ${field.label}`}
                      >
                        <DirectionButton
                          active={rule.direction === "asc"}
                          label={`Sort ${field.label} ascending`}
                          onClick={() => onUpdate(index, { ...rule, direction: "asc" })}
                        >
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                        </DirectionButton>
                        <DirectionButton
                          active={rule.direction === "desc"}
                          label={`Sort ${field.label} descending`}
                          onClick={() => onUpdate(index, { ...rule, direction: "desc" })}
                        >
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                        </DirectionButton>
                      </div>

                      <button
                        type="button"
                        aria-label={`Remove ${field.label} sort`}
                        onClick={() => onRemove(index)}
                        className={cn(
                          "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md",
                          "text-faint transition-colors duration-100 ease-out hover:bg-danger-soft hover:text-danger",
                          focusRing
                        )}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-border p-1">
            <PopoverRow
              icon={<Plus aria-hidden />}
              disabled={available.length === 0}
              onClick={() => setAdding(true)}
            >
              Add sort
            </PopoverRow>
          </div>
        </>
      )}
    </>
  )
}

function DirectionButton({
  active,
  label,
  onClick,
  children
}: {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-6 w-7 cursor-pointer items-center justify-center rounded",
        "transition-colors duration-100 ease-out",
        focusRing,
        active ? "bg-surface text-foreground shadow-sm" : "text-faint hover:text-muted"
      )}
    >
      {children}
    </button>
  )
}

/** Short human summary for the toolbar chip, e.g. "Due date ↑". */
export function describeSort<T>(rule: SortRule, fields: FieldDef<T>[]): string {
  const field = fields.find((f) => f.id === rule.fieldId)
  if (!field) return "Sort"
  return `${field.label} ${rule.direction === "asc" ? "ascending" : "descending"}`
}
