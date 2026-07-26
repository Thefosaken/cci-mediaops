"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addYears,
  subYears,
} from "date-fns"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Calendar } from "lucide-react"
import { cn } from "@/lib/utils/cn"

interface DatePickerProps {
  id?: string
  value: string | undefined
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  "aria-label"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

const DAYS = ["S", "M", "T", "W", "T", "F", "S"] as const
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

const PANEL_WIDTH = 300
const PANEL_HEIGHT = 356

/**
 * Read a `yyyy-MM-dd` value as a local calendar day.
 *
 * `new Date("2026-08-02")` is parsed as UTC midnight, so anywhere behind UTC it
 * renders — and highlights — the 1st. The date on a run sheet or a roster is a
 * calendar day, not an instant, and it must not shift with the reader's timezone.
 * Appending a time forces local parsing. Full timestamps are passed through, since
 * those genuinely are instants.
 */
function parseLocalDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
}

/**
 * The app's calendar, in a field.
 *
 * The panel is portaled to the body with fixed coordinates rather than positioned
 * absolutely inside the field. Every scrollable surface in the app — the dashboard
 * `<main>`, the modal's centring scroller — is an `overflow-y-auto` ancestor, and an
 * absolutely positioned panel is clipped by all of them. This is the same
 * portal-plus-trigger-rect pattern Select uses, for the same reason (see CLAUDE.md).
 */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const [viewDate, setViewDate] = React.useState(() => (value ? parseLocalDate(value) : new Date()))
  const [pos, setPos] = React.useState<{ top: number; left: number; openUpward: boolean } | null>(null)

  const containerRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => { setMounted(true) }, [])

  const selectedDate = value ? parseLocalDate(value) : null

  /**
   * Reopening lands on the selected value's month, not on wherever the panel was
   * left last time. Done on the way in rather than in an effect — the month is a
   * consequence of the click, and syncing it after the fact costs a second render
   * during which the wrong month is briefly on screen.
   */
  function toggle() {
    if (!open) setViewDate(value ? parseLocalDate(value) : new Date())
    setOpen(!open)
  }

  const monthStart = startOfMonth(viewDate)
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(endOfMonth(viewDate)),
  })

  React.useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      e.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKey, true)
    }
  }, [open])

  React.useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    function compute() {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const padding = 8
      const gap = 4
      const below = window.innerHeight - rect.bottom - gap - padding
      const above = rect.top - gap - padding
      const openUpward = below < PANEL_HEIGHT && above > below
      // Clamped so a field near the right edge doesn't push the panel off-screen.
      const left = Math.min(
        Math.max(padding, rect.left),
        window.innerWidth - PANEL_WIDTH - padding
      )
      setPos({ top: openUpward ? rect.top : rect.bottom, left, openUpward })
    }
    compute()
    window.addEventListener("scroll", compute, true)
    window.addEventListener("resize", compute)
    return () => {
      window.removeEventListener("scroll", compute, true)
      window.removeEventListener("resize", compute)
    }
  }, [open])

  function selectDay(day: Date) {
    onChange(format(day, "yyyy-MM-dd"))
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        // `aria-invalid` is meaningless on a button, so the state is carried as data
        // and shown in the border. The error text itself is linked by describedby and
        // announced by FormField's `role="alert"`.
        data-invalid={ariaInvalid ? "" : undefined}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border border-border bg-canvas px-3 py-2",
          "text-left text-sm transition-colors duration-150",
          "hover:border-border-strong",
          "focus-visible:outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-focus-ring/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[invalid]:border-danger",
          open && "border-border-strong ring-2 ring-focus-ring/20"
        )}
      >
        <span className={cn("truncate", !selectedDate && "text-faint")}>
          {selectedDate ? format(selectedDate, "EEE d MMM yyyy") : placeholder}
        </span>
        <Calendar className="ml-2 size-4 shrink-0 text-faint" aria-hidden="true" />
      </button>

      {open && mounted && pos && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose a date"
          style={{
            position: "fixed",
            top: pos.openUpward ? undefined : pos.top + 4,
            bottom: pos.openUpward ? window.innerHeight - pos.top + 4 : undefined,
            left: pos.left,
            width: PANEL_WIDTH,
            zIndex: 100,
          }}
          className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-md animate-slide-up"
        >
          <div className="flex items-center justify-between px-3 pb-2 pt-3">
            <div className="flex items-center gap-0.5">
              <NavButton label="Previous year" onClick={() => setViewDate((d) => subYears(d, 1))}>
                <ChevronsLeft className="size-3.5" />
              </NavButton>
              <NavButton label="Previous month" onClick={() => setViewDate((d) => subMonths(d, 1))}>
                <ChevronLeft className="size-4" />
              </NavButton>
            </div>
            <span className="select-none text-[13px] font-semibold text-foreground">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <div className="flex items-center gap-0.5">
              <NavButton label="Next month" onClick={() => setViewDate((d) => addMonths(d, 1))}>
                <ChevronRight className="size-4" />
              </NavButton>
              <NavButton label="Next year" onClick={() => setViewDate((d) => addYears(d, 1))}>
                <ChevronsRight className="size-3.5" />
              </NavButton>
            </div>
          </div>

          <div className="grid grid-cols-7 px-3 pb-1">
            {/*
              Keyed by index, not by the letter: "S" and "T" each appear twice in a
              week, so the label is not unique. A fixed, ordered list is exactly the
              case where the index is the correct key.
            */}
            {DAYS.map((d, i) => (
              <div
                key={i}
                aria-hidden="true"
                className="flex h-7 select-none items-center justify-center text-[11px] font-medium text-faint"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5 px-3 pb-3">
            {days.map((day, idx) => {
              const isSelected = selectedDate && isSameDay(day, selectedDate)
              const isCurrentMonth = isSameMonth(day, viewDate)
              const isCurrentDay = isToday(day)
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectDay(day)}
                  disabled={!isCurrentMonth}
                  aria-current={isCurrentDay ? "date" : undefined}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-lg text-[13px] tabular-nums",
                    "transition-[background-color,color] duration-100",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40",
                    isCurrentMonth
                      ? "cursor-pointer text-foreground hover:bg-surface-subtle"
                      : "cursor-default text-faint/40",
                    isSelected && "bg-primary font-medium text-white hover:bg-primary/90",
                    isCurrentDay && !isSelected && "ring-1 ring-inset ring-border-strong"
                  )}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => selectDay(new Date())}
              className="text-[12px] font-medium text-primary transition-colors hover:text-primary/80"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false) }}
                className="text-[12px] text-faint transition-colors hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-md p-1 text-faint transition-colors hover:bg-surface-subtle hover:text-foreground"
    >
      {children}
    </button>
  )
}
