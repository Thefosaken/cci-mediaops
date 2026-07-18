"use client"

import * as React from "react"
import { ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils/cn"

/**
 * Start time plus duration, which together define a session's span.
 *
 * There is deliberately no end-time picker. On a run sheet you think in lengths — "the
 * prayer is twenty minutes" — not in end times, and asking for two absolute times
 * invites the one mistake that matters: an end before its start. Here that state cannot
 * be expressed, so there is no error to recover from.
 *
 * The start is a segmented field rather than a native `<input type="time">`. The native
 * control renders differently in every browser, ignores the design system's type scale
 * and border treatment, and its spinner is invisible until focus. A segmented field
 * keeps hour, minute and meridiem individually focusable, adjustable with arrow keys or
 * the scroll wheel, and typeable — while looking like everything else in the app.
 */

const DURATION_PRESETS = [15, 30, 45, 60] as const

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function durationLabel(mins: number) {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/* ────────────────────────────────────────────────────────────────── */

/** One editable segment of the time — hour, minute, or meridiem. */
function Segment({
  value,
  display,
  min,
  max,
  step = 1,
  wrap = true,
  onCommit,
  ariaLabel,
  width,
}: {
  value: number
  display: string
  min: number
  max: number
  step?: number
  wrap?: boolean
  onCommit: (next: number) => void
  ariaLabel: string
  width: string
}) {
  const [typed, setTyped] = React.useState<string | null>(null)

  const shift = (delta: number) => {
    let next = value + delta
    if (wrap) {
      const span = max - min + 1
      next = ((((next - min) % span) + span) % span) + min
    } else {
      next = clamp(next, min, max)
    }
    onCommit(next)
  }

  return (
    <span
      role="spinbutton"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault()
          shift(step)
        } else if (e.key === "ArrowDown") {
          e.preventDefault()
          shift(-step)
        } else if (/^\d$/.test(e.key)) {
          // Typing accumulates digits, so "0" then "5" lands on 05 rather than 5 then 0.
          const nextTyped = ((typed ?? "") + e.key).slice(-2)
          const parsed = Number(nextTyped)
          setTyped(nextTyped)
          if (parsed >= min && parsed <= max) onCommit(parsed)
        }
      }}
      onBlur={() => setTyped(null)}
      onWheel={(e) => {
        // Only when focused, so an idle scroll past the panel doesn't change times.
        if (document.activeElement !== e.currentTarget) return
        e.preventDefault()
        shift(e.deltaY < 0 ? step : -step)
      }}
      style={{ width }}
      className={cn(
        "cursor-ns-resize rounded-[4px] py-0.5 text-center tabular-nums",
        "transition-colors duration-100",
        "hover:bg-[var(--surface-hover)]",
        "focus:bg-primary focus:text-[var(--color-primary-foreground)] focus:outline-none"
      )}
    >
      {display}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────── */

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

  const hour24 = start.getHours()
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  const minute = start.getMinutes()
  const isPm = hour24 >= 12

  const applyStart = (h12: number, m: number, pm: boolean) => {
    const h24 = (h12 % 12) + (pm ? 12 : 0)
    const nextStart = new Date(start)
    nextStart.setHours(h24, m, 0, 0)
    // Moving the start carries the session rather than stretching it.
    onChange({ start: nextStart, end: new Date(+nextStart + durationMins * 60_000) })
  }

  const setDuration = (mins: number) => {
    const safe = clamp(mins, 5, 12 * 60)
    onChange({ start, end: new Date(+start + safe * 60_000) })
  }

  const nudgeDuration = (delta: number) => setDuration(durationMins + delta)

  return (
    <div className="space-y-3.5">
      {/* ── Start ─────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="mb-1.5 block text-[11.5px] font-medium text-muted">Starts</span>
          <div
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md border border-border bg-surface px-2 py-1.5",
              "text-[15px] font-medium text-foreground",
              "transition-[border-color] duration-150 hover:border-border-strong",
              "focus-within:border-[var(--color-focus-ring)] focus-within:ring-2 focus-within:ring-[var(--color-focus-ring)]/20",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            <Segment
              ariaLabel="Hour"
              value={hour12}
              display={String(hour12)}
              min={1}
              max={12}
              width="1.6ch"
              onCommit={(h) => applyStart(h, minute, isPm)}
            />
            <span className="text-faint">:</span>
            <Segment
              ariaLabel="Minute"
              value={minute}
              display={String(minute).padStart(2, "0")}
              min={0}
              max={59}
              step={5}
              width="2.2ch"
              onCommit={(m) => applyStart(hour12, m, isPm)}
            />
            <Segment
              ariaLabel="AM or PM"
              value={isPm ? 1 : 0}
              display={isPm ? "PM" : "AM"}
              min={0}
              max={1}
              width="2.6ch"
              onCommit={(v) => applyStart(hour12, minute, v === 1)}
            />
          </div>
        </div>

        {/* The end is a consequence, not an input — shown so it is never a surprise. */}
        <div className="pb-2 text-right">
          <span className="block text-[11.5px] text-faint">Ends</span>
          <span className="block text-[14px] font-medium tabular-nums text-foreground">
            {end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
      </div>

      {/* ── Duration ──────────────────────────────────────────── */}
      <div>
        <span className="mb-1.5 block text-[11.5px] font-medium text-muted">Duration</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {DURATION_PRESETS.map((mins) => (
            <button
              key={mins}
              type="button"
              disabled={disabled}
              onClick={() => setDuration(mins)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-[12px] font-medium tabular-nums",
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

          {/* Stepper for anything the presets don't cover. */}
          <span
            className={cn(
              "ml-auto inline-flex items-center rounded-md border border-border bg-surface",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            <button
              type="button"
              aria-label="Five minutes shorter"
              onClick={() => nudgeDuration(-5)}
              className="grid h-7 w-7 place-items-center text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground"
            >
              <ChevronDown className="size-3.5" />
            </button>
            <span className="min-w-[5.5ch] px-1 text-center text-[12px] font-medium tabular-nums text-foreground">
              {durationLabel(durationMins)}
            </span>
            <button
              type="button"
              aria-label="Five minutes longer"
              onClick={() => nudgeDuration(5)}
              className="grid h-7 w-7 place-items-center text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground"
            >
              <ChevronUp className="size-3.5" />
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
