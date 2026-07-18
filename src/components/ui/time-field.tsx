"use client"

import * as React from "react"
import { Select } from "./select"

/**
 * Time picker built on the design system's Select.
 *
 * Times are chosen from a list at a fixed step rather than typed, which is how every
 * calendar people already use works — typing "8:05 AM" correctly is fiddly, picking it
 * is not. Reusing Select means it inherits the portalled dropdown that survives being
 * inside a scrollable panel, plus the existing keyboard and focus behaviour.
 *
 * When `relativeTo` is given, each option is annotated with its distance from that time
 * ("1 hr", "45 min"), so choosing an end time doubles as choosing a duration.
 */

const STEP_MINUTES = 5

function label(totalMinutes: number) {
  const h24 = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  const period = h24 < 12 ? "AM" : "PM"
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

function duration(mins: number) {
  if (mins <= 0) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

export function TimeField({
  value,
  onChange,
  relativeTo,
  id,
  "aria-label": ariaLabel,
}: {
  /** A Date, or null. Only the time-of-day is edited; the date is carried through. */
  value: Date | null
  onChange: (next: Date) => void
  /** Annotate options with their distance from this time. */
  relativeTo?: Date | null
  id?: string
  "aria-label"?: string
}) {
  const current = value ? value.getHours() * 60 + value.getMinutes() : 0
  const anchor = relativeTo ? relativeTo.getHours() * 60 + relativeTo.getMinutes() : null

  const options = React.useMemo(() => {
    const out: { value: string; label: string }[] = []
    for (let m = 0; m < 24 * 60; m += STEP_MINUTES) {
      const gap = anchor === null ? null : duration(m - anchor)
      out.push({
        value: String(m),
        label: gap ? `${label(m)}  ·  ${gap}` : label(m),
      })
    }
    // A time that isn't on the step boundary still needs to be selectable, or the field
    // would silently show the wrong value.
    if (current % STEP_MINUTES !== 0) {
      out.push({ value: String(current), label: label(current) })
      out.sort((a, b) => Number(a.value) - Number(b.value))
    }
    return out
  }, [anchor, current])

  return (
    <Select
      id={id}
      aria-label={ariaLabel}
      searchable
      value={String(current)}
      options={options}
      onChange={(v) => {
        const mins = Number(v)
        const next = value ? new Date(value) : new Date()
        next.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
        onChange(next)
      }}
    />
  )
}
