"use client"

import { format, isSameMonth, isToday } from "date-fns"
import { cn } from "@/lib/utils/cn"
import { TEAM_COLORS, type TeamColor } from "./team-colors"

/**
 * Month and week grids, following the conventions Google and Notion both settled on:
 * a fixed six-row month so the layout never reflows between months, days numbered in
 * the corner, today marked on the number itself rather than by filling the cell, and
 * entries as compact chips that overflow into "+N more".
 *
 * Chips carry a team colour so a lead scanning a month sees their own team's pattern
 * without reading a single name — the same job Google's per-account colours do.
 */

export interface CalendarEntry {
  id: string
  kind: "event" | "duty"
  date: Date
  label: string
  /** Sub-line: a time for events, the team name for duties. */
  meta?: string
  color: TeamColor | null
  /** Duties belonging to the signed-in user get emphasis — it's their own rota. */
  mine?: boolean
  dimmed?: boolean
}

export function MonthGrid({
  days,
  month,
  entriesByDay,
  selected,
  onSelectDay,
}: {
  days: Date[]
  month: Date
  entriesByDay: Map<string, CalendarEntry[]>
  selected: Date | null
  onSelectDay: (day: Date, anchor: DOMRect) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Weekday header */}
      <div className="grid shrink-0 grid-cols-7 border-b border-border">
        {days.slice(0, 7).map((d) => (
          <div
            key={d.toISOString()}
            className="px-2 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint"
          >
            {format(d, "EEE")}
          </div>
        ))}
      </div>

      {/* Six fixed rows, so the grid never jumps height between months. */}
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const key = day.toDateString()
          const entries = entriesByDay.get(key) ?? []
          const outside = !isSameMonth(day, month)
          const today = isToday(day)
          const isSelected = selected?.toDateString() === key

          return (
            <button
              key={key}
              type="button"
              onClick={(e) => onSelectDay(day, e.currentTarget.getBoundingClientRect())}
              className={cn(
                "group flex min-h-0 flex-col gap-1 overflow-hidden border-b border-r border-border p-1.5 text-left",
                "transition-colors duration-100",
                outside ? "bg-[var(--surface-subtle)]/30" : "hover:bg-surface-subtle/50",
                isSelected && "bg-surface-subtle"
              )}
            >
              <span
                className={cn(
                  "grid size-[22px] shrink-0 place-items-center rounded-full text-[11.5px] tabular-nums",
                  today
                    ? "bg-primary font-semibold text-[var(--color-primary-foreground)]"
                    : outside
                      ? "text-faint"
                      : "text-muted"
                )}
              >
                {format(day, "d")}
              </span>

              <div className="flex min-h-0 flex-col gap-[3px] overflow-hidden">
                {entries.slice(0, 3).map((e) => (
                  <Chip key={e.id} entry={e} />
                ))}
                {entries.length > 3 && (
                  <span className="px-1 text-[10.5px] text-faint">+{entries.length - 3} more</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────── */

export function WeekGrid({
  days,
  entriesByDay,
  selected,
  onSelectDay,
}: {
  days: Date[]
  entriesByDay: Map<string, CalendarEntry[]>
  selected: Date | null
  onSelectDay: (day: Date, anchor: DOMRect) => void
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-7">
      {days.map((day) => {
        const key = day.toDateString()
        const entries = entriesByDay.get(key) ?? []
        const today = isToday(day)
        const isSelected = selected?.toDateString() === key

        return (
          <button
            key={key}
            type="button"
            onClick={(e) => onSelectDay(day, e.currentTarget.getBoundingClientRect())}
            className={cn(
              "flex min-h-0 flex-col border-r border-border text-left last:border-r-0",
              "transition-colors duration-100 hover:bg-surface-subtle/40",
              isSelected && "bg-surface-subtle/70"
            )}
          >
            <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-canvas/85 px-2 py-2 backdrop-blur-sm">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
                {format(day, "EEE")}
              </p>
              <p
                className={cn(
                  "mt-1 grid size-[26px] place-items-center rounded-full text-[14px] tabular-nums",
                  today
                    ? "bg-primary font-semibold text-[var(--color-primary-foreground)]"
                    : "font-medium text-foreground"
                )}
              >
                {format(day, "d")}
              </p>
            </div>

            {/* A week column has room for the full list rather than a "+N more". */}
            <div className="flex flex-col gap-1 overflow-y-auto p-1.5">
              {entries.map((e) => (
                <Chip key={e.id} entry={e} expanded />
              ))}
              {entries.length === 0 && (
                <span className="px-1 py-2 text-[11px] text-faint">—</span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────── */

function Chip({ entry, expanded }: { entry: CalendarEntry; expanded?: boolean }) {
  const palette = entry.color ? TEAM_COLORS[entry.color] : null

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 truncate rounded-[5px] px-1.5 py-[3px] text-[11px] leading-tight",
        entry.kind === "event"
          ? "bg-surface-subtle text-foreground ring-1 ring-inset ring-border"
          : cn(palette?.chip ?? "bg-surface-subtle text-muted"),
        entry.mine && "font-semibold",
        entry.dimmed && "opacity-45"
      )}
    >
      {/* Duties carry a colour dot; events read as neutral so the two are never confused. */}
      {entry.kind === "duty" && (
        <span className={cn("size-1.5 shrink-0 rounded-full", palette?.dot ?? "bg-muted")} />
      )}
      <span className="truncate">{entry.label}</span>
      {expanded && entry.meta && (
        <span className="ml-auto shrink-0 text-[10px] opacity-70">{entry.meta}</span>
      )}
    </span>
  )
}
