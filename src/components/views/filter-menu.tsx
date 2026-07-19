"use client"

import * as React from "react"
import { Check, ChevronDown, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import type { FieldDef, FieldOption, FilterOperator, FilterRule } from "@/lib/views/types"

import { FieldIcon } from "./field-icon"
import { FieldList } from "./field-picker-menu"
import { PopoverRow, ViewPopover, focusRing } from "./view-popover"

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "is", label: "is" },
  { value: "is_not", label: "is not" },
  { value: "is_any_of", label: "is any of" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" }
]

/** Only these operators compare against values. */
function needsValues(operator: FilterOperator): boolean {
  return operator === "is" || operator === "is_not" || operator === "is_any_of"
}

interface FilterMenuProps<T> {
  open: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
  fields: FieldDef<T>[]
  /** Source for `dynamicOptions` on open sets like people or requesting units. */
  records: T[]
  filters: FilterRule[]
  onAdd: (rule: FilterRule) => void
  onUpdate: (index: number, rule: FilterRule) => void
  onRemove: (index: number) => void
  align?: "start" | "end"
}

/**
 * Builds and edits `FilterRule[]`.
 *
 * Field → operator → value(s), each rule a removable row. Operators use a
 * native `<select>` on purpose: a nested portaled dropdown inside a portaled
 * popover fights the outside-click handler, and the OS picker is the calmer,
 * more reliable control on mobile anyway.
 */
export function FilterMenu<T>({
  open,
  onClose,
  triggerRef,
  fields,
  records,
  filters,
  onAdd,
  onUpdate,
  onRemove,
  align = "start"
}: FilterMenuProps<T>) {
  return (
    <ViewPopover
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      label="Filter"
      align={align}
      width={320}
      maxHeight={420}
    >
      {/* Mounted only while open, so the add/edit step resets on every open
          without a state-syncing effect. */}
      <FilterMenuBody
        fields={fields}
        records={records}
        filters={filters}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    </ViewPopover>
  )
}

type FilterMenuBodyProps<T> = Pick<
  FilterMenuProps<T>,
  "fields" | "records" | "filters" | "onAdd" | "onUpdate" | "onRemove"
>

function FilterMenuBody<T>({
  fields,
  records,
  filters,
  onAdd,
  onUpdate,
  onRemove
}: FilterMenuBodyProps<T>) {
  // A menu opened with no rules should land straight on the field list.
  const [adding, setAdding] = React.useState(filters.length === 0)

  const filterable = React.useMemo(
    () => fields.filter((f) => f.filterable !== false),
    [fields]
  )

  const optionsFor = React.useCallback(
    (field: FieldDef<T>): FieldOption[] =>
      field.options ?? field.dynamicOptions?.(records) ?? [],
    [records]
  )

  function handlePickField(fieldId: string) {
    onAdd({ fieldId, operator: "is", values: [] })
    setAdding(false)
  }

  return (
    <>
      {adding ? (
        <FieldList
          fields={filterable}
          onPick={handlePickField}
          emptyLabel="No filterable fields"
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filters.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] text-faint">No filters yet</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {filters.map((rule, index) => {
                  const field = fields.find((f) => f.id === rule.fieldId)
                  if (!field) return null
                  const options = optionsFor(field)
                  const single = rule.operator === "is"
                  return (
                    <li
                      key={`${rule.fieldId}-${index}`}
                      className="rounded-md border border-border bg-surface p-2"
                    >
                      <div className="flex items-center gap-2">
                        <FieldIcon name={field.icon} type={field.type} className="text-faint" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                          {field.label}
                        </span>
                        <OperatorSelect
                          value={rule.operator}
                          onChange={(operator) =>
                            onUpdate(index, {
                              ...rule,
                              operator,
                              values: needsValues(operator)
                                ? operator === "is"
                                  ? rule.values.slice(0, 1)
                                  : rule.values
                                : []
                            })
                          }
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${field.label} filter`}
                          onClick={() => onRemove(index)}
                          className={cn(
                            "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md",
                            "text-faint transition-colors duration-100 ease-out hover:bg-danger-soft hover:text-danger",
                            focusRing
                          )}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </button>
                      </div>

                      {needsValues(rule.operator) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {options.length === 0 ? (
                            <span className="px-1 text-[12px] text-faint">
                              No values available
                            </span>
                          ) : (
                            options.map((option) => {
                              const checked = rule.values.includes(option.value)
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  aria-pressed={checked}
                                  onClick={() =>
                                    onUpdate(index, {
                                      ...rule,
                                      values: single
                                        ? checked
                                          ? []
                                          : [option.value]
                                        : checked
                                          ? rule.values.filter((v) => v !== option.value)
                                          : [...rule.values, option.value]
                                    })
                                  }
                                  className={cn(
                                    // 24px — a real target, where py-0.5 gave ~18px.
                                    "inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border px-2 text-[12px]",
                                    "transition-colors duration-100 ease-out",
                                    focusRing,
                                    checked
                                      ? "border-primary/40 bg-primary-soft text-primary"
                                      : "border-border bg-surface-subtle text-muted hover:border-border-strong hover:text-foreground"
                                  )}
                                >
                                  {option.label}
                                  {/* Trailing, matching the field picker: the
                                      check follows the thing it confirms.
                                      12px — a state glyph inside a 24px chip. */}
                                  {checked && <Check className="-mr-0.5 h-3 w-3" aria-hidden />}
                                </button>
                              )
                            })
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-border p-1">
            <PopoverRow icon={<Plus aria-hidden />} onClick={() => setAdding(true)}>
              Add filter
            </PopoverRow>
          </div>
        </>
      )}
    </>
  )
}

function OperatorSelect({
  value,
  onChange
}: {
  value: FilterOperator
  onChange: (operator: FilterOperator) => void
}) {
  return (
    <span className="relative shrink-0">
      <select
        value={value}
        aria-label="Filter operator"
        onChange={(e) => onChange(e.target.value as FilterOperator)}
        className={cn(
          "h-7 cursor-pointer appearance-none rounded-md border border-border bg-surface-subtle",
          "pl-2 pr-6 text-[12px] text-muted transition-colors duration-100 ease-out",
          "hover:border-border-strong hover:text-foreground",
          focusRing
        )}
      >
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>
      {/* 12px: a disclosure glyph, not an icon — 16px would crowd a 28px select. */}
      <ChevronDown
        className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-faint"
        aria-hidden
      />
    </span>
  )
}

/** Short human summary for the toolbar chip, e.g. "Status is Blocked". */
export function describeFilter<T>(rule: FilterRule, fields: FieldDef<T>[]): string {
  const field = fields.find((f) => f.id === rule.fieldId)
  if (!field) return "Filter"
  const operator = OPERATORS.find((o) => o.value === rule.operator)?.label ?? "is"
  if (!needsValues(rule.operator)) return `${field.label} ${operator}`
  if (rule.values.length === 0) return `${field.label}…`
  const options = field.options ?? []
  const first = options.find((o) => o.value === rule.values[0])?.label ?? rule.values[0]
  const rest = rule.values.length - 1
  return `${field.label} ${operator} ${first}${rest > 0 ? ` +${rest}` : ""}`
}
