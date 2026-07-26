"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Clock, X } from "lucide-react"

import { cn } from "@/lib/utils/cn"

/**
 * A time field built from the app's own parts rather than the browser's.
 *
 * `<input type="time">` draws a glyph we cannot restyle, sizes itself differently in
 * every engine, and — the reason this exists — leaves two clock icons in the field
 * once a themed one is layered over it: the one the design system draws and the one
 * the browser insists on. Only one of them was ever clickable, which is exactly the
 * kind of detail that makes a form feel broken without anyone being able to say why.
 *
 * So the control is a combobox, the same shape as Select and DatePicker: a typeable
 * trigger with a portaled list of quarter-hours. You can type "930", "9:30", "9.30pm"
 * or "21:30" and it resolves; you can also just pick, which is what most people do.
 *
 * `relativeTo` turns the list into an end-time picker: options are rotated to begin
 * after the start time and annotated with the span they produce, because when you are
 * choosing when something ends you are really choosing how long it runs.
 */

interface TimePickerProps {
  id?: string
  /** 24-hour "HH:mm", or "" for empty. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** Shows a clear affordance once a time is set. Off by default — most times are required. */
  clearable?: boolean
  /** Another "HH:mm". Rotates and annotates the list so this reads as a duration. */
  relativeTo?: string
  /** Minutes between offered times. */
  step?: number
  className?: string
  "aria-label"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

const MINUTES_IN_DAY = 24 * 60

/* ── Parsing and formatting ─────────────────────────────────────────────── */

/** Minutes since midnight for an "HH:mm", or null. */
function toMinutes(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

function fromMinutes(total: number): string {
  const wrapped = ((total % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`
}

/** "09:30" → "9:30 AM". Empty in, empty out. */
export function formatTime(value: string): string {
  const mins = toMinutes(value)
  if (mins === null) return ""
  const h24 = Math.floor(mins / 60)
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(mins % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`
}

/**
 * Everything a person might reasonably type for a time.
 *
 * "9", "930", "9:30", "9.30", "0930", "9pm", "9:30 pm", "21:30". A bare hour past 12
 * without a meridiem is read as 24-hour, which is the only reading that can be right.
 */
export function parseTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/[\s.]/g, "")
  if (!s) return null

  const m = /^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/.exec(s)
  if (!m) return null

  let hours = Number(m[1])
  const minutes = m[2] === undefined ? 0 : Number(m[2])
  const meridiem = m[3]?.[0]

  if (minutes > 59) return null

  if (meridiem) {
    if (hours < 1 || hours > 12) return null
    hours = (hours % 12) + (meridiem === "p" ? 12 : 0)
  } else if (hours > 23) {
    return null
  }

  return fromMinutes(hours * 60 + minutes)
}

/** "1h 30m" for the span between two times, wrapping past midnight. */
function spanLabel(fromMins: number, toMins: number): string {
  let delta = toMins - fromMins
  if (delta <= 0) delta += MINUTES_IN_DAY
  const h = Math.floor(delta / 60)
  const m = delta % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Loose match so typing "930" or "9:3" narrows the list the way it looks like it should. */
function matches(option: string, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/[\s.:]/g, "")
  if (!q) return true
  const label = formatTime(option).toLowerCase().replace(/[\s.:]/g, "")
  return label.startsWith(q) || option.replace(":", "").startsWith(q) || label.includes(q)
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function TimePicker({
  id,
  value,
  onChange,
  placeholder = "--:--",
  disabled = false,
  clearable = false,
  relativeTo,
  step = 15,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<string | null>(null)
  const [highlight, setHighlight] = React.useState(-1)
  const [mounted, setMounted] = React.useState(false)
  const [pos, setPos] = React.useState<{
    top: number
    left: number
    width: number
    openUpward: boolean
    maxHeight: number
  } | null>(null)

  const listId = React.useId()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)

  React.useEffect(() => { setMounted(true) }, [])

  const anchorMins = relativeTo ? toMinutes(relativeTo) : null

  /**
   * The offered times, rotated so an end-time list starts just after its start.
   * A list that opens at midnight when the service began at nine makes you scroll
   * past nine hours of times nobody was ever going to pick.
   */
  const options = React.useMemo(() => {
    const all: string[] = []
    for (let m = 0; m < MINUTES_IN_DAY; m += step) all.push(fromMinutes(m))
    if (anchorMins === null) return all
    const pivot = all.findIndex((t) => (toMinutes(t) ?? 0) > anchorMins)
    return pivot <= 0 ? all : [...all.slice(pivot), ...all.slice(0, pivot)]
  }, [step, anchorMins])

  const filtered = React.useMemo(
    () => (draft === null ? options : options.filter((o) => matches(o, draft))),
    [options, draft]
  )

  const display = draft ?? formatTime(value)

  /** Where the highlight lands when the list opens: on your time, or the nearest one. */
  const indexOfCurrent = React.useCallback(() => {
    if (!value) return anchorMins === null ? -1 : 0
    const exact = filtered.indexOf(value)
    if (exact >= 0) return exact
    const mins = toMinutes(value)
    if (mins === null) return -1
    let best = -1
    let bestGap = Infinity
    filtered.forEach((o, i) => {
      const gap = Math.abs((toMinutes(o) ?? 0) - mins)
      if (gap < bestGap) { bestGap = gap; best = i }
    })
    return best
  }, [filtered, value, anchorMins])

  /* Close on outside pointer — the list lives in a portal, so both roots count. */
  React.useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      commitDraft()
      setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
    // commitDraft is stable enough for this effect's purpose; re-binding on every
    // keystroke would tear the listener down mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft])

  /* Track the trigger while open, flipping up when the viewport runs out below. */
  React.useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    function compute() {
      const trigger = containerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const preferred = 288
      const padding = 8
      const gap = 4
      const below = window.innerHeight - rect.bottom - gap - padding
      const above = rect.top - gap - padding
      const openUpward = below < preferred && above > below
      const available = openUpward ? above : below
      setPos({
        top: openUpward ? rect.top : rect.bottom,
        left: rect.left,
        width: rect.width,
        openUpward,
        maxHeight: Math.max(140, Math.min(preferred, available)),
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

  /* Bring the highlighted row into view without scrolling anything but the list. */
  React.useEffect(() => {
    if (!open || highlight < 0) return
    const list = listRef.current
    const row = list?.children[highlight] as HTMLElement | undefined
    if (!list || !row) return
    const top = row.offsetTop
    const bottom = top + row.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top - 4
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight + 4
    }
  }, [open, highlight, pos])

  function openList() {
    if (disabled || open) return
    setOpen(true)
    setHighlight(indexOfCurrent())
  }

  function commit(next: string) {
    onChange(next)
    setDraft(null)
    setOpen(false)
    inputRef.current?.focus()
  }

  /** Typed text wins if it resolves; otherwise the field snaps back to what it held. */
  function commitDraft() {
    if (draft === null) return
    const parsed = parseTime(draft)
    if (parsed) onChange(parsed)
    setDraft(null)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        if (!open) { openList(); break }
        setHighlight((i) => Math.min(i + 1, filtered.length - 1))
        break
      case "ArrowUp":
        e.preventDefault()
        if (!open) { openList(); break }
        setHighlight((i) => Math.max(i - 1, 0))
        break
      case "Enter":
        e.preventDefault()
        if (open && highlight >= 0 && filtered[highlight]) commit(filtered[highlight])
        else { commitDraft(); setOpen(false) }
        break
      case "Escape":
        if (open) e.stopPropagation()
        setDraft(null)
        setOpen(false)
        break
      case "Tab":
        commitDraft()
        setOpen(false)
        break
    }
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div
        className={cn(
          "flex h-10 w-full items-center rounded-lg border border-border bg-canvas pl-3 pr-2",
          "transition-[border-color,box-shadow] duration-150",
          "hover:border-border-strong",
          "focus-within:border-border-strong focus-within:ring-2 focus-within:ring-focus-ring/20",
          open && "border-border-strong ring-2 ring-focus-ring/20",
          ariaInvalid && "border-danger",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-activedescendant={
            open && highlight >= 0 && filtered[highlight]
              ? `${listId}-${filtered[highlight]}`
              : undefined
          }
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          autoComplete="off"
          spellCheck={false}
          inputMode="numeric"
          disabled={disabled}
          value={display}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value)
            setHighlight(0)
            if (!open) setOpen(true)
          }}
          onFocus={openList}
          onClick={openList}
          onKeyDown={onKeyDown}
          onBlur={(e) => {
            // A click landing inside the portaled list is not leaving the field.
            if (dropdownRef.current?.contains(e.relatedTarget as Node)) return
            commitDraft()
          }}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-sm tabular-nums text-foreground",
            "placeholder:text-faint placeholder:tabular-nums",
            "outline-none"
          )}
        />

        {clearable && value && !disabled ? (
          <button
            type="button"
            aria-label="Clear time"
            onClick={() => { onChange(""); setDraft(null); inputRef.current?.focus() }}
            className="grid size-6 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-surface-subtle hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Choose a time"
            onClick={() => {
              if (open) { setOpen(false); return }
              inputRef.current?.focus()
              openList()
            }}
            className="grid size-6 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-surface-subtle hover:text-foreground"
          >
            <Clock className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {open && mounted && pos && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: pos.openUpward ? undefined : pos.top + 4,
            bottom: pos.openUpward ? window.innerHeight - pos.top + 4 : undefined,
            left: pos.left,
            width: Math.max(pos.width, 150),
            maxHeight: pos.maxHeight,
            zIndex: 100,
          }}
          className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-md animate-slide-up"
        >
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel ?? "Times"}
            className="min-h-0 flex-1 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-5 text-center text-[12.5px] text-faint">
                No time like that
              </li>
            ) : (
              filtered.map((option, idx) => {
                const selected = option === value
                const focused = idx === highlight
                const mins = toMinutes(option) ?? 0
                return (
                  <li
                    key={option}
                    id={`${listId}-${option}`}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setHighlight(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(option)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] tabular-nums",
                      "transition-colors duration-75",
                      focused && "bg-surface-subtle",
                      selected ? "font-medium text-foreground" : "text-muted",
                      !selected && focused && "text-foreground"
                    )}
                  >
                    <span className="flex-1">{formatTime(option)}</span>
                    {anchorMins !== null && (
                      <span className="shrink-0 text-[11px] text-faint">
                        {spanLabel(anchorMins, mins)}
                      </span>
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
