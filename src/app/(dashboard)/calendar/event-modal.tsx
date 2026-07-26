"use client"

import { useMemo, useRef, useState, type ReactNode } from "react"
import { format } from "date-fns"
import { ChevronRight, Minus, Plus, Repeat, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { EVENT_TYPES } from "@/constants"
import { MAX_SLOTS_PER_EVENT } from "@/lib/validators"
import type { EventInput } from "@/lib/validators"
import { createEvent } from "@/server/actions/events"
import { expandRecurrence, toIsoDate, type Frequency } from "@/lib/utils/rostering"
import { TEAM_COLORS, type TeamColor } from "./team-colors"

import { Modal } from "@/components/ui/modal"
import { Button, IconButton } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { DateInput } from "@/components/ui/date-input"
import { FormField } from "@/components/ui/form-field"
import { Switch } from "@/components/ui/switch"

/**
 * Creating an event.
 *
 * The order is what → services → repeat, because that is the order the answers exist
 * in someone's head: they know it is a Sunday Service before they know it runs twice,
 * and they know it runs twice before they decide it runs every week until Christmas.
 *
 * Services are optional and start at zero. Most events are a single block of time, and
 * a composer that opens with an empty service row teaches people to fill one in for
 * events that never needed one — which then costs a slot every clash check for the
 * rest of the event's life.
 *
 * The repeat preview is the load-bearing part of the third section. A frequency and a
 * count are two small numbers that quietly mean fifty-two rows in the calendar; showing
 * the dates they land on is the only moment before commit where that is visible.
 */

/** Suggestions, cycled by position — the first service is very rarely called anything else. */
const SLOT_LABELS = ["First Service", "Second Service", "Evening"]

const FREQUENCIES = [
  { value: "weekly", label: "Every week" },
  { value: "fortnightly", label: "Every two weeks" },
  { value: "monthly", label: "Every month" }
]

interface SlotDraft {
  id: string
  label: string
  start: string
  end: string
  /** People wanted per sub-team id. A team absent, or at zero, is simply not required. */
  requirements: Record<string, number>
  teamsOpen: boolean
}

export function EventModal({
  initialDate,
  teams,
  colorFor,
  onClose,
  onDone,
  onError
}: {
  /** The day the user clicked; prefills date fields. */
  initialDate: Date
  teams: { id: string; name: string; color: string | null }[]
  colorFor: Map<string, TeamColor>
  onClose: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const [title, setTitle] = useState("")
  const [eventType, setEventType] = useState("")
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState("")
  const [date, setDate] = useState(toIsoDate(initialDate))
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("")

  const [slots, setSlots] = useState<SlotDraft[]>([])
  const nextSlotId = useRef(0)

  const [repeats, setRepeats] = useState(false)
  const [frequency, setFrequency] = useState<Frequency>("weekly")
  const [countText, setCountText] = useState("4")

  const [saving, setSaving] = useState(false)

  const repeatCount = Math.min(52, Math.max(2, Math.floor(Number(countText)) || 2))

  const addSlot = () => {
    const id = String(nextSlotId.current++)
    setSlots((prev) => [
      ...prev,
      {
        id,
        label: "",
        // Inherits the event's start rather than opening empty. An empty required field
        // fails on submit with nothing on screen to point at; a wrong-but-visible time
        // gets corrected before anyone clicks save.
        start: startTime,
        end: "",
        requirements: {},
        teamsOpen: false
      }
    ])
  }

  const patchSlot = (id: string, patch: Partial<SlotDraft>) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const setRequirement = (id: string, teamId: string, next: number) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, requirements: { ...s.requirements, [teamId]: Math.max(0, Math.min(50, next)) } }
          : s
      )
    )
  }

  /**
   * Card order is read off the array index at submit rather than stored, so removing
   * the second of three renumbers the third by construction and a gap cannot be
   * created in the first place.
   *
   * It decides the order of these services relative to each other, not the position
   * they take in the day. Positions are unique per campus per day and the server
   * allocates them, because only the server can see the other events already on that
   * date — an evening event added to a Sunday that already runs two services becomes
   * the day's third and fourth, whatever these cards are numbered.
   */
  const removeSlot = (id: string) => setSlots((prev) => prev.filter((s) => s.id !== id))

  const eventTimeError = spanError(startTime, endTime)
  const slotHasError = slots.some((s) => spanError(s.start, s.end) !== null)

  const occurrences = useMemo(() => {
    if (!repeats) return []
    const base = localDateTime(date, startTime)
    return base ? expandRecurrence(base, frequency, repeatCount) : []
  }, [repeats, date, startTime, frequency, repeatCount])

  const submit = async () => {
    const start = localDateTime(date, startTime)
    if (!start) return

    const end = endTime ? localDateTime(date, endTime) : null
    const slotDate = toIsoDate(start)

    // The event's team list is derived from its services rather than asked for twice —
    // two answers to "which teams" can disagree, and then coverage is computed against
    // whichever one the reader happened to open.
    const requiredSubTeams = [
      ...new Set(
        slots.flatMap((s) =>
          Object.entries(s.requirements)
            .filter(([, needed]) => needed > 0)
            .map(([teamId]) => teamId)
        )
      )
    ]

    const payload: EventInput = {
      title: title.trim(),
      eventType,
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      startTime: start.toISOString(),
      endTime: end ? end.toISOString() : undefined,
      requiredSubTeams: requiredSubTeams.length ? requiredSubTeams : undefined,
      slots: slots.length
        ? slots.map((s, index) => ({
            // The greyed suggestion is a default, not decoration: an unnamed service is
            // rejected by the schema, and "First Service" is what it was going to be called.
            label: s.label.trim() || suggestionFor(index),
            slotOrder: index + 1,
            slotDate,
            startTime: (localDateTime(date, s.start) ?? start).toISOString(),
            endTime: s.end ? localDateTime(date, s.end)?.toISOString() : undefined,
            requirements: Object.entries(s.requirements)
              .filter(([, needed]) => needed > 0)
              .map(([subTeamId, neededCount]) => ({ subTeamId, neededCount }))
          }))
        : undefined,
      recurrence: repeats ? { frequency, count: repeatCount } : undefined
    }

    setSaving(true)
    const res = await createEvent(payload)
    setSaving(false)

    if (res.error) return onError(res.error)

    const made = res.count ?? 1
    const name = payload.title
    onDone(
      made > 1
        ? `${name} created — ${made} dates`
        : slots.length > 0
          ? `${name} created with ${slots.length} service${slots.length === 1 ? "" : "s"}`
          : `${name} created`
    )
  }

  const day = localDateTime(date, "12:00")

  return (
    <Modal
      open
      onClose={onClose}
      title="New event"
      description={day ? format(day, "EEEE d MMMM yyyy") : "Pick a date"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={
              !title.trim() ||
              !eventType ||
              !startTime ||
              slotHasError ||
              eventTimeError !== null
            }
            onClick={submit}
          >
            {occurrences.length > 1 ? `Create ${occurrences.length} events` : "Create event"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* ── What ────────────────────────────────────────────── */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            What
          </h3>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Title" required>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Sunday Service"
                  autoFocus
                />
              </FormField>

              <FormField label="Type" required>
                <Select
                  value={eventType}
                  onChange={setEventType}
                  options={EVENT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                  placeholder="Choose a type…"
                />
              </FormField>
            </div>

            <FormField label="Location" hint="Optional">
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Main auditorium"
              />
            </FormField>

            <FormField label="Description" hint="Optional">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Anything the teams should know before the day."
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FormField label="Date" required>
                <DateInput
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </FormField>

              <FormField label="Starts" required>
                <DateInput
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </FormField>

              <FormField label="Ends" hint="Optional" error={eventTimeError ?? undefined}>
                <DateInput
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </FormField>
            </div>
          </div>
        </section>

        {/* ── Services ────────────────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Services
            </h3>
            {slots.length > 0 && (
              <span className="text-[11px] text-faint">
                {slots.length} of {MAX_SLOTS_PER_EVENT}
              </span>
            )}
          </div>

          {slots.length === 0 ? (
            <p className="text-[12.5px] leading-relaxed text-muted">
              An event with no services is rostered as one all-day block. Add them only when
              a day runs more than once — a first and a second service, say — so people can
              be put on one without being counted as present for both.
            </p>
          ) : (
            <ul className="space-y-2">
              {slots.map((slot, index) => {
                const error = spanError(slot.start, slot.end)
                const needed = teams.filter((t) => (slot.requirements[t.id] ?? 0) > 0)

                return (
                  <li
                    key={slot.id}
                    className="rounded-md border border-border bg-[var(--surface-subtle)] p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-1.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-semibold text-muted">
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-start gap-2">
                          <Input
                            value={slot.label}
                            onChange={(e) => patchSlot(slot.id, { label: e.target.value })}
                            placeholder={suggestionFor(index)}
                            aria-label={`Service ${index + 1} name`}
                            className="min-w-[9rem] flex-1"
                          />
                          {/* Boxed rather than sized directly — DateInput's icon wrapper
                              is w-full, so the width has to live outside it. */}
                          <div className="w-[7.25rem] shrink-0">
                            <DateInput
                              type="time"
                              value={slot.start}
                              onChange={(e) => patchSlot(slot.id, { start: e.target.value })}
                              aria-label={`Service ${index + 1} start`}
                            />
                          </div>
                          <div className="w-[7.25rem] shrink-0">
                            <DateInput
                              type="time"
                              value={slot.end}
                              onChange={(e) => patchSlot(slot.id, { end: e.target.value })}
                              aria-label={`Service ${index + 1} end, optional`}
                            />
                          </div>
                        </div>

                        {error && (
                          <p role="alert" className="text-[11.5px] text-danger">
                            {error}
                          </p>
                        )}

                        {/* Requirements are folded away by default. Most services want the
                            same teams as last week, and unfolding seven steppers per slot
                            buries the times — which is the part people actually retype. */}
                        <div>
                          <button
                            type="button"
                            onClick={() => patchSlot(slot.id, { teamsOpen: !slot.teamsOpen })}
                            aria-expanded={slot.teamsOpen}
                            className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[11.5px] text-muted transition-colors hover:text-foreground"
                          >
                            <ChevronRight
                              className={cn(
                                "size-3 shrink-0 transition-transform duration-150",
                                slot.teamsOpen && "rotate-90"
                              )}
                            />
                            <span className="shrink-0">Teams needed</span>
                            {!slot.teamsOpen && (
                              <span className="min-w-0 flex-1 truncate text-faint">
                                {needed.length === 0
                                  ? "No teams set"
                                  : needed
                                      .map((t) => `${t.name} ${slot.requirements[t.id]}`)
                                      .join(" · ")}
                              </span>
                            )}
                          </button>

                          {slot.teamsOpen && (
                            <ul className="mt-1 space-y-0.5 border-t border-border pt-2">
                              {teams.map((team) => {
                                const value = slot.requirements[team.id] ?? 0
                                return (
                                  <li
                                    key={team.id}
                                    className="flex items-center gap-2 px-1 py-0.5"
                                  >
                                    <span
                                      className={cn(
                                        "size-2 shrink-0 rounded-full",
                                        TEAM_COLORS[colorFor.get(team.id) ?? "blue"].dot
                                      )}
                                    />
                                    <span
                                      className={cn(
                                        "min-w-0 flex-1 truncate text-[12.5px]",
                                        value > 0 ? "text-foreground" : "text-muted"
                                      )}
                                    >
                                      {team.name}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-0.5">
                                      <Stepper
                                        label={`One fewer on ${team.name}`}
                                        disabled={value === 0}
                                        onClick={() =>
                                          setRequirement(slot.id, team.id, value - 1)
                                        }
                                      >
                                        <Minus className="size-3" />
                                      </Stepper>
                                      <span
                                        className={cn(
                                          "w-5 text-center text-[12px] tabular-nums",
                                          value > 0 ? "text-foreground" : "text-faint"
                                        )}
                                      >
                                        {value}
                                      </span>
                                      <Stepper
                                        label={`One more on ${team.name}`}
                                        onClick={() =>
                                          setRequirement(slot.id, team.id, value + 1)
                                        }
                                      >
                                        <Plus className="size-3" />
                                      </Stepper>
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </div>
                      </div>

                      <IconButton
                        label={`Remove service ${index + 1}`}
                        size="sm"
                        onClick={() => removeSlot(slot.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {slots.length < MAX_SLOTS_PER_EVENT ? (
            <Button size="sm" variant="outline" onClick={addSlot} className="mt-2.5">
              <Plus className="size-3.5" />
              Add service
            </Button>
          ) : (
            // No disabled button here: a control that looks pressable and does nothing
            // reads as a fault, where a sentence reads as a rule.
            <p className="mt-2.5 text-[11.5px] text-faint">
              {MAX_SLOTS_PER_EVENT} services is the maximum for one day.
            </p>
          )}
        </section>

        {/* ── Repeat ──────────────────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Repeat
            </h3>
            <Switch checked={repeats} onChange={setRepeats} label="Repeat this event" />
          </div>

          {!repeats ? (
            <p className="text-[12.5px] text-muted">
              A one-off. Turn this on for a service that runs to a pattern.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="How often">
                  <Select
                    value={frequency}
                    onChange={(value) => setFrequency(value as Frequency)}
                    options={FREQUENCIES}
                  />
                </FormField>

                <FormField label="How many times" helper="Between 2 and 52.">
                  <Input
                    type="number"
                    min={2}
                    max={52}
                    value={countText}
                    onChange={(e) => setCountText(e.target.value)}
                  />
                </FormField>
              </div>

              {/* Each occurrence becomes a real row. Reading the first dates back is the
                  difference between committing a term and committing a year. */}
              {occurrences.length > 0 && (
                <div className="mt-3 rounded-md border border-border bg-[var(--surface-subtle)] px-3 py-2.5">
                  <p className="flex items-start gap-1.5 text-[12.5px] text-foreground">
                    <Repeat className="mt-0.5 size-3.5 shrink-0 text-faint" />
                    <span>
                      {occurrences
                        .slice(0, 3)
                        .map((d) => format(d, "EEE d MMM"))
                        .join(" · ")}
                    </span>
                  </p>
                  {occurrences.length > 3 && (
                    <p className="mt-1 pl-5 text-[11.5px] text-muted">
                      …and {occurrences.length - 3} more, ending{" "}
                      {format(occurrences[occurrences.length - 1], "d MMMM yyyy")}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </Modal>
  )
}

/** Quiet square control for the team counts. Too small for IconButton's scale. */
function Stepper({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-6 place-items-center rounded border border-border bg-surface text-muted",
        "transition-colors hover:text-foreground hover:border-border-strong",
        "disabled:pointer-events-none disabled:opacity-40"
      )}
    >
      {children}
    </button>
  )
}

function suggestionFor(index: number) {
  return SLOT_LABELS[index % SLOT_LABELS.length]
}

/**
 * Wall-clock, assembled field by field.
 *
 * `new Date("2026-07-26T09:00")` happens to parse as local time, but the rule differs by
 * shape — the date-only form is UTC — and a service that silently moves an hour is the
 * kind of bug nobody reports until the roster is already wrong.
 */
function localDateTime(date: string, time: string): Date | null {
  if (!date || !time) return null
  const [y, m, d] = date.split("-").map(Number)
  const [hh, mm] = time.split(":").map(Number)
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return null
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

/** Both times sit on the same calendar day, so zero-padded strings compare correctly. */
function spanError(start: string, end: string): string | null {
  if (!start || !end) return null
  return end <= start ? "Ends before it starts" : null
}
