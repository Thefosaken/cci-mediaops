"use client"

import * as React from "react"
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
  value: string | undefined
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

const DAYS = ["S", "M", "T", "W", "T", "F", "S"] as const
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

export function DatePicker({ value, onChange, placeholder = "Select date", className }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [viewDate, setViewDate] = React.useState(() => value ? new Date(value) : new Date())
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  const selectedDate = value ? new Date(value) : null

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  function selectDay(day: Date) {
    onChange(format(day, "yyyy-MM-dd"))
    setOpen(false)
  }

  function prevMonth() { setViewDate((d) => subMonths(d, 1)) }
  function nextMonth() { setViewDate((d) => addMonths(d, 1)) }
  function prevYear() { setViewDate((d) => subYears(d, 1)) }
  function nextYear() { setViewDate((d) => addYears(d, 1)) }

  return (
    <div className={cn("relative w-full", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border border-border bg-canvas px-3 py-2",
          "text-sm transition-colors duration-150 text-left",
          "hover:border-border-strong",
          "focus-visible:outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-focus-ring/20",
          open && "border-border-strong ring-2 ring-focus-ring/20"
        )}
      >
        <span className={cn("truncate", !selectedDate && "text-faint")}>
          {selectedDate ? format(selectedDate, "MMM d, yyyy") : placeholder}
        </span>
        <Calendar className="h-4 w-4 text-faint shrink-0 ml-2" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[89]" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "absolute z-[90] mt-1 w-[300px] rounded-xl border border-border bg-surface-raised shadow-lg",
              "animate-slide-up overflow-hidden"
            )}
            style={{ minWidth: "280px" }}
          >
            {/* Header: month/year navigation */}
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={prevYear}
                  className="rounded-md p-1 text-faint hover:text-foreground hover:bg-surface-subtle transition-colors"
                  aria-label="Previous year"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={prevMonth}
                  className="rounded-md p-1 text-faint hover:text-foreground hover:bg-surface-subtle transition-colors"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              <span className="text-[13px] font-semibold text-foreground select-none">
                {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={nextMonth}
                  className="rounded-md p-1 text-faint hover:text-foreground hover:bg-surface-subtle transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={nextYear}
                  className="rounded-md p-1 text-faint hover:text-foreground hover:bg-surface-subtle transition-colors"
                  aria-label="Next year"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 px-3 pb-1">
              {DAYS.map((d) => (
                <div
                  key={d}
                  className="flex h-8 items-center justify-center text-[11px] font-medium text-faint select-none"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 px-3 pb-3 gap-0.5">
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
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg text-[13px] transition-colors duration-75",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/20",
                      isCurrentMonth
                        ? "text-foreground hover:bg-surface-subtle cursor-pointer"
                        : "text-faint/40 cursor-default",
                      isSelected && "bg-primary text-white hover:bg-primary/90 font-medium",
                      isCurrentDay && !isSelected && "ring-1 ring-inset ring-border-strong"
                    )}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>

            {/* Footer: today shortcut + clear */}
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  selectDay(new Date())
                }}
                className="text-[12px] text-primary hover:text-primary/80 transition-colors font-medium"
              >
                Today
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("")
                    setOpen(false)
                  }}
                  className="text-[12px] text-faint hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
