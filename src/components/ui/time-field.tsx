"use client"

import * as React from "react"
import { cn } from "@/lib/utils/cn"
import { DateInput } from "./date-input"

/**
 * Start time plus duration, which together define a session's span.
 *
 * This deliberately does not offer an "end time" picker. On a run sheet you think in
 * lengths — "the prayer is twenty minutes" — not in end times, and asking for two
 * absolute times invites the one mistake that matters: an end before its start. Here
 * that state cannot be expressed at all, so there is no error to recover from.
 *
 * The start uses the design system's native time input rather than a list of every
 * five-minute slot in the day. A 288-item dropdown is slow to scan, clips at the
 * viewport edge, and cannot be typed into; the native control accepts "8:05 AM" from
 * the keyboard and is already localised and accessible.
 */

const PRESETS = [5, 10, 15, 30, 45, 60, 90] as const

function toTimeValue(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function formatClock(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

export function durationLabel(mins: number) {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function SessionTimeFields({
  start,
  end,
  onChange,
  disabled,
}: {
  start: Date
  end: Date
  /** Emits both, always consistent: end is derived from start + duration. */
  onChange: (next: { start: Date; end: Date }) => void
  disabled?: boolean
}) {
  const durationMins = Math.max(5, Math.round((+end - +start) / 60_000))
  const isPreset = (PRESETS as readonly number[]).includes(durationMins)

  const setStart = (value: string) => {
    const [h, m] = value.split(":").map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return
    const nextStart = new Date(start)
    nextStart.setHours(h, m, 0, 0)
    // Moving the start carries the session with it rather than stretching it.
    onChange({ start: nextStart, end: new Date(+nextStart + durationMins * 60_000) })
  }

  const setDuration = (mins: number) => {
    const safe = Math.max(5, Math.min(12 * 60, mins))
    onChange({ start, end: new Date(+start + safe * 60_000) })
  }

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-[11.5px] font-medium text-muted">Starts</span>
          <DateInput
            type="time"
            value={toTimeValue(start)}
            onChange={(e) => setStart(e.target.value)}
            disabled={disabled}
          />
        </label>

        {/* The end is a consequence, not an input — shown so it is never a surprise. */}
        <div className="pb-2 text-right">
          <span className="block text-[11.5px] text-faint">Ends</span>
          <span className="block text-[13px] font-medium tabular-nums text-foreground">
            {formatClock(end)}
          </span>
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-[11.5px] font-medium text-muted">Duration</span>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((mins) => (
            <button
              key={mins}
              type="button"
              disabled={disabled}
              onClick={() => setDuration(mins)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[12px] font-medium tabular-nums",
                "transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out-quart)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                "disabled:cursor-not-allowed disabled:opacity-50",
                durationMins === mins
                  ? "border-primary bg-primary text-[var(--color-primary-foreground)]"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground"
              )}
            >
              {durationLabel(mins)}
            </button>
          ))}

          {/* Anything the presets don't cover, without leaving the row. */}
          <span
            className={cn(
              "flex items-center gap-1 rounded-md border px-2 py-1 text-[12px]",
              isPreset ? "border-border bg-surface" : "border-primary bg-[var(--color-primary-soft)]"
            )}
          >
            <input
              type="number"
              min={5}
              max={720}
              step={5}
              disabled={disabled}
              value={durationMins}
              onChange={(e) => setDuration(Number(e.target.value))}
              aria-label="Custom duration in minutes"
              className="w-[3.5ch] bg-transparent text-right tabular-nums text-foreground outline-none
                         [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-faint">min</span>
          </span>
        </div>
      </div>
    </div>
  )
}
