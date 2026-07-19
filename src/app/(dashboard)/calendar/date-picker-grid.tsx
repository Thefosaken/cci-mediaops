"use client"

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isBefore,
  startOfDay,
  startOfMonth,
} from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { IconButton } from "@/components/ui/button"

/**
 * Multi-date picker.
 *
 * Weekday letters head their own columns and double as select-all controls for that
 * column. In the previous version they sat beside the section label, disconnected from
 * the grid — so they read as decoration and it was not obvious that tapping "S" would
 * select every Sunday.
 *
 * Cells are square and dense. A month of dates is reference material you scan, not a
 * form you fill in, so it should occupy the space of a calendar rather than the space
 * of seven rows of buttons.
 */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const

export function DatePickerGrid({
  month,
  onMonthChange,
  picked,
  taken,
  onToggle,
  onToggleWeekday,
  accentDot,
}: {
  month: Date
  onMonthChange: (next: Date) => void
  picked: Set<string>
  /** Days already rostered — shown as inert rather than rejected on submit. */
  taken: ReadonlySet<string>
  onToggle: (iso: string) => void
  onToggleWeekday: (weekday: number) => void
  accentDot?: string
}) {
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const leadIn = startOfMonth(month).getDay()
  const today = startOfDay(new Date())

  return (
    // Capped width. Left to fill a large modal, seven square cells become 80px blocks
    // that dominate the dialog; a date picker is a fixed-size instrument.
    <div className="mx-auto w-full max-w-[272px]">
      {/* Month navigation — scheduling often spans a month boundary, and being locked
          to whatever the calendar behind was showing made that impossible. */}
      <div className="mb-2.5 flex items-center justify-between">
        <IconButton
          label="Previous month"
          size="xs"
          variant="ghost"
          onClick={() => onMonthChange(addMonths(month, -1))}
        >
          <ChevronLeft className="size-3.5" />
        </IconButton>
        <span className="text-[13px] font-medium text-foreground">
          {format(month, "MMMM yyyy")}
        </span>
        <IconButton
          label="Next month"
          size="xs"
          variant="ghost"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <ChevronRight className="size-3.5" />
        </IconButton>
      </div>

      {/* Weekday headers, sitting over the columns they act on. */}
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onToggleWeekday(i)}
            title={`Select every ${format(new Date(2024, 0, 7 + i), "EEEE")}`}
            className="grid h-6 place-items-center rounded text-[10.5px] font-semibold uppercase tracking-wide
                       text-faint transition-colors duration-100 hover:bg-surface-subtle hover:text-foreground"
          >
            {d}
          </button>
        ))}
      </div>

      <div className="mt-0.5 grid grid-cols-7 gap-0.5">
        {Array.from({ length: leadIn }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}

        {days.map((d) => {
          const iso = format(d, "yyyy-MM-dd")
          const on = picked.has(iso)
          const isTaken = taken.has(iso)
          const past = isBefore(d, today)
          const isToday = d.getTime() === today.getTime()

          return (
            <button
              key={iso}
              type="button"
              disabled={isTaken}
              onClick={() => onToggle(iso)}
              title={isTaken ? "Already on duty" : undefined}
              className={cn(
                "relative grid aspect-square place-items-center rounded-md text-[12px] tabular-nums",
                "transition-[background-color,color,box-shadow] duration-100 ease-[var(--ease-out-quart)]",
                isTaken
                  ? "cursor-not-allowed text-faint"
                  : on
                    ? "bg-primary font-semibold text-[var(--color-primary-foreground)]"
                    : cn(
                        "text-muted hover:bg-surface-subtle hover:text-foreground",
                        // Past days stay selectable — backfilling a rota is legitimate —
                        // but recede so the eye lands on what's ahead.
                        past && "opacity-45"
                      ),
                isToday && !on && "ring-1 ring-inset ring-border-strong"
              )}
            >
              {format(d, "d")}
              {isTaken && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-1 size-1 rounded-full",
                    accentDot ?? "bg-muted"
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
