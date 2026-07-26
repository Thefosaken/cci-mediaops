"use client"

import { useMemo, useRef, useState, type ReactNode } from "react"
import { format } from "date-fns"
import {
  AlertTriangle,
  ChevronRight,
  Minus,
  Plus,
  Repeat,
  Trash2
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { EVENT_TYPES } from "@/constants"
import { MAX_SLOTS_PER_EVENT } from "@/lib/validators"
import type { EventInput } from "@/lib/validators"
import {
  addSlot,
  cancelEvent,
  createEvent,
  deleteEvent,
  deleteSlot,
  describeEventImpact,
  setSlotRequirements,
  updateEvent,
  updateSlot
} from "@/server/actions/events"
import { expandRecurrence, toIsoDate, type Frequency } from "@/lib/utils/rostering"
import { TEAM_COLORS, type TeamColor } from "./team-colors"

import { Modal } from "@/components/ui/modal"
import { Button, IconButton } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { DatePicker } from "@/components/ui/date-picker"
import { TimePicker } from "@/components/ui/time-picker"
import { FormField } from "@/components/ui/form-field"
import { Switch } from "@/components/ui/switch"

/**
 * Composing an event, and editing one.
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
 *
 * Edit is the same form, not a second one. An event's shape is its details plus its
 * services, and a separate editor would drift from the composer within a release —
 * two places to add a field is one place to forget. What changes in edit mode is the
 * ending: repeat disappears (a series is created, never retro-fitted), and the footer
 * grows the two ways an event ends.
 */

/** Suggestions, cycled by position — the first service is very rarely called anything else. */
const SLOT_LABELS = ["First Service", "Second Service", "Evening"]

const FREQUENCIES = [
  { value: "weekly", label: "Every week" },
  { value: "fortnightly", label: "Every two weeks" },
  { value: "monthly", label: "Every month" }
]

/** The event as the calendar already holds it, when one is being edited. */
export interface EditableEvent {
  id: string
  title: string
  event_type: string
  description: string | null
  location: string | null
  start_time: string
  end_time: string | null
  status: string
  recurrence_group_id: string | null
  slots: {
    id: string
    label: string
    slot_order: number
    slot_date: string
    start_time: string
    end_time: string | null
    requirements: { sub_team_id: string; needed_count: number }[]
  }[]
}

interface SlotDraft {
  /** Local key. Stable across renders; unrelated to the database id. */
  id: string
  /** Set only for a service that already exists on the server. */
  existingId?: string
  label: string
  start: string
  end: string
  /** People wanted per sub-team id. A team absent, or at zero, is simply not required. */
  requirements: Record<string, number>
  teamsOpen: boolean
}

export function EventModal({
  initialDate,
  event,
  teams,
  colorFor,
  canDelete = false,
  onClose,
  onDone,
  onError
}: {
  /** The day the user clicked; prefills date fields when creating. */
  initialDate: Date
  /** Present when editing. Absent means this is a new event. */
  event?: EditableEvent
  teams: { id: string; name: string; color: string | null }[]
  colorFor: Map<string, TeamColor>
  /** Cancelling and deleting are an administrator's call, not a lead's. */
  canDelete?: boolean
  onClose: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const editing = event !== undefined

  const [title, setTitle] = useState(event?.title ?? "")
  const [eventType, setEventType] = useState(event?.event_type ?? "")
  const [location, setLocation] = useState(event?.location ?? "")
  const [description, setDescription] = useState(event?.description ?? "")
  const [date, setDate] = useState(
    toIsoDate(event ? new Date(event.start_time) : initialDate)
  )
  const [startTime, setStartTime] = useState(
    event ? clockOf(event.start_time) : "09:00"
  )
  const [endTime, setEndTime] = useState(
    event?.end_time ? clockOf(event.end_time) : ""
  )

  const [slots, setSlots] = useState<SlotDraft[]>(() => draftsFrom(event))
  const nextSlotId = useRef(slots.length)

  /** What the server held when this opened, so saving can send only what moved. */
  const baseline = useRef(draftsFrom(event))

  const [repeats, setRepeats] = useState(false)
  const [frequency, setFrequency] = useState<Frequency>("weekly")
  const [countText, setCountText] = useState("4")

  const [saving, setSaving] = useState(false)
  /** Two-step destructive confirm, in place — a modal on top of a modal is a maze. */
  const [ending, setEnding] = useState<null | "cancel" | "delete">(null)
  const [impact, setImpact] = useState<{ slots: number; duties: number; runSheets: number } | null>(
    null
  )

  const repeatCount = Math.min(52, Math.max(2, Math.floor(Number(countText)) || 2))

  const addService = () => {
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

  /* ── Create ──────────────────────────────────────────────── */

  const create = async () => {
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

  /* ── Save an existing one ────────────────────────────────── */

  /**
   * Saved as a diff rather than a replace.
   *
   * A service carries duties, a run sheet and a position in the day. Deleting and
   * re-adding the four services of a Sunday to change one label would take every
   * roster on them with it, so an untouched service is left strictly alone and only
   * what actually moved is sent.
   */
  const save = async () => {
    if (!event) return
    const start = localDateTime(date, startTime)
    if (!start) return

    const end = endTime ? localDateTime(date, endTime) : null
    const slotDate = toIsoDate(start)

    setSaving(true)

    const detail = await updateEvent(event.id, {
      title: title.trim(),
      eventType,
      description: description.trim(),
      location: location.trim(),
      startTime: start.toISOString(),
      // "" clears it; undefined would leave the old end time behind.
      endTime: end ? end.toISOString() : ""
    })
    if (detail.error) {
      setSaving(false)
      return onError(detail.error)
    }

    const kept = new Set(slots.map((s) => s.existingId).filter(Boolean))

    for (const gone of baseline.current) {
      if (gone.existingId && !kept.has(gone.existingId)) {
        const res = await deleteSlot(gone.existingId)
        if (res.error) {
          setSaving(false)
          return onError(res.error)
        }
      }
    }

    for (const [index, slot] of slots.entries()) {
      const label = slot.label.trim() || suggestionFor(index)
      const startIso = (localDateTime(date, slot.start) ?? start).toISOString()
      const endIso = slot.end ? (localDateTime(date, slot.end)?.toISOString() ?? null) : null
      const wanted = Object.entries(slot.requirements)
        .filter(([, needed]) => needed > 0)
        .map(([subTeamId, neededCount]) => ({ subTeamId, neededCount }))

      if (!slot.existingId) {
        const res = await addSlot(event.id, {
          label,
          slotOrder: index + 1,
          slotDate,
          startTime: startIso,
          endTime: endIso ?? undefined,
          requirements: wanted
        })
        if (res.error) {
          setSaving(false)
          return onError(res.error)
        }
        continue
      }

      const before = baseline.current.find((b) => b.existingId === slot.existingId)
      const original = event.slots.find((s) => s.id === slot.existingId)

      const detailsMoved =
        !before ||
        before.label !== slot.label ||
        before.start !== slot.start ||
        before.end !== slot.end ||
        original?.slot_date !== slotDate

      if (detailsMoved) {
        const res = await updateSlot(slot.existingId, {
          label,
          slotDate,
          startTime: startIso,
          endTime: endIso
        })
        if (res.error) {
          setSaving(false)
          return onError(res.error)
        }
      }

      if (!before || !sameRequirements(before.requirements, slot.requirements)) {
        const res = await setSlotRequirements(slot.existingId, wanted)
        if (res.error) {
          setSaving(false)
          return onError(res.error)
        }
      }
    }

    setSaving(false)
    onDone(`${title.trim() || "Event"} updated`)
  }

  /* ── Ending an event ─────────────────────────────────────── */

  const beginEnding = async (kind: "cancel" | "delete") => {
    if (!event) return
    setEnding(kind)
    setImpact(null)
    // Fetched at the moment of asking, so the sentence names real numbers rather than
    // a generic warning nobody reads.
    setImpact(await describeEventImpact(event.id))
  }

  const confirmEnding = async () => {
    if (!event || !ending) return
    setSaving(true)
    const res = ending === "cancel" ? await cancelEvent(event.id) : await deleteEvent(event.id)
    setSaving(false)
    if (res.error) return onError(res.error)
    onDone(ending === "cancel" ? `${event.title} cancelled` : `${event.title} deleted`)
  }

  const day = localDateTime(date, "12:00")
  const incomplete = !title.trim() || !eventType || !startTime || slotHasError || eventTimeError !== null

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit event" : "New event"}
      description={day ? format(day, "EEEE d MMMM yyyy") : "Pick a date"}
      size="lg"
      footer={
        ending ? (
          <EndingFooter
            kind={ending}
            impact={impact}
            saving={saving}
            onBack={() => setEnding(null)}
            onConfirm={confirmEnding}
          />
        ) : (
          <>
            {editing && canDelete && (
              <div className="mr-auto flex items-center gap-1">
                {event?.status !== "cancelled" && (
                  <Button size="sm" variant="ghost" onClick={() => beginEnding("cancel")}>
                    Cancel event
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:text-danger"
                  onClick={() => beginEnding("delete")}
                >
                  Delete
                </Button>
              </div>
            )}
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button loading={saving} disabled={incomplete} onClick={editing ? save : create}>
              {editing
                ? "Save changes"
                : occurrences.length > 1
                  ? `Create ${occurrences.length} events`
                  : "Create event"}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-6">
        {/* ── What ────────────────────────────────────────────── */}
        <Section title="What">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Title" required>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Sunday Service"
                  autoFocus={!editing}
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

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
              <FormField label="Date" required>
                <DatePicker value={date} onChange={setDate} />
              </FormField>

              <FormField label="Starts" required>
                <TimePicker value={startTime} onChange={setStartTime} />
              </FormField>

              <FormField label="Ends" hint="Optional" error={eventTimeError ?? undefined}>
                {/* Anchored to the start, so the list reads as durations — which is
                    how anyone actually decides when a service ends. */}
                <TimePicker
                  value={endTime}
                  onChange={setEndTime}
                  relativeTo={startTime}
                  clearable
                />
              </FormField>
            </div>
          </div>
        </Section>

        {/* ── Services ────────────────────────────────────────── */}
        <Section
          title="Services"
          aside={
            slots.length > 0 ? (
              <span className="text-[11px] tabular-nums text-faint">
                {slots.length} of {MAX_SLOTS_PER_EVENT}
              </span>
            ) : undefined
          }
        >
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
                    className="rounded-lg border border-border bg-[var(--surface-subtle)] p-3
                               transition-colors duration-150 focus-within:border-border-strong"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-2.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-semibold tabular-nums text-muted">
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-start gap-2">
                          <Input
                            value={slot.label}
                            onChange={(e) => patchSlot(slot.id, { label: e.target.value })}
                            placeholder={suggestionFor(index)}
                            aria-label={`Service ${index + 1} name`}
                            className="h-10 min-w-[9rem] flex-1 rounded-lg bg-canvas"
                          />
                          <div className="w-[7.75rem] shrink-0">
                            <TimePicker
                              value={slot.start}
                              onChange={(v) => patchSlot(slot.id, { start: v })}
                              aria-label={`Service ${index + 1} start`}
                            />
                          </div>
                          <div className="w-[7.75rem] shrink-0">
                            <TimePicker
                              value={slot.end}
                              onChange={(v) => patchSlot(slot.id, { end: v })}
                              relativeTo={slot.start}
                              clearable
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
                                "size-3 shrink-0 transition-transform duration-150 ease-[var(--ease-out-quart)]",
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
                        className="mt-0.5"
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
            <Button size="sm" variant="outline" onClick={addService} className="mt-2.5">
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

          {editing && slots.some((s) => !s.existingId) && (
            <p className="mt-2 text-[11.5px] text-faint">
              New services take the next free position on the day.
            </p>
          )}
        </Section>

        {/* ── Repeat, or the series this belongs to ───────────── */}
        {editing ? (
          event?.recurrence_group_id && (
            <Section title="Series">
              <p className="flex items-start gap-1.5 text-[12.5px] text-muted">
                <Repeat className="mt-0.5 size-3.5 shrink-0 text-faint" />
                <span>
                  This event repeats. Changes here apply to this date only — the other
                  dates in the series keep what they had.
                </span>
              </p>
            </Section>
          )
        ) : (
          <Section
            title="Repeat"
            aside={<Switch checked={repeats} onChange={setRepeats} label="Repeat this event" />}
          >
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
                  <div className="mt-3 rounded-lg border border-border bg-[var(--surface-subtle)] px-3 py-2.5">
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
          </Section>
        )}
      </div>
    </Modal>
  )
}

/* ────────────────────────────────────────────────────────────────── */

/** A titled band. The hairline does the separating so the sections need no boxes. */
function Section({
  title,
  aside,
  children
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-2.5 flex min-h-[22px] items-center justify-between gap-3">
        <h3 className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          {title}
        </h3>
        <span className="h-px min-w-4 flex-1 bg-border" aria-hidden="true" />
        {aside}
      </div>
      {children}
    </section>
  )
}

/**
 * The footer, once someone has reached for one of the two ways an event ends.
 *
 * The blast radius is named before the button that causes it. "Delete" on its own is
 * a word; "removes 2 services and 6 rostered people" is the decision.
 */
function EndingFooter({
  kind,
  impact,
  saving,
  onBack,
  onConfirm
}: {
  kind: "cancel" | "delete"
  impact: { slots: number; duties: number; runSheets: number } | null
  saving: boolean
  onBack: () => void
  onConfirm: () => void
}) {
  const pieces = impact
    ? [
        impact.slots > 0 && `${impact.slots} service${impact.slots === 1 ? "" : "s"}`,
        impact.duties > 0 && `${impact.duties} rostered ${impact.duties === 1 ? "person" : "people"}`,
        impact.runSheets > 0 && `${impact.runSheets} run sheet${impact.runSheets === 1 ? "" : "s"}`
      ].filter(Boolean)
    : []

  return (
    <>
      <p className="mr-auto flex items-start gap-2 pr-3 text-[12.5px] leading-snug text-muted">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--warning)]" />
        <span>
          {kind === "cancel" ? (
            <>
              Cancelling keeps the event on the calendar, marked so people can plan
              around it.
            </>
          ) : (
            <>
              Deleting is permanent
              {pieces.length > 0 && <> and takes {pieces.join(", ")} with it</>}.
            </>
          )}
        </span>
      </p>
      <Button variant="ghost" onClick={onBack} disabled={saving}>
        Back
      </Button>
      <Button
        variant={kind === "delete" ? "danger" : "primary"}
        loading={saving}
        onClick={onConfirm}
      >
        {kind === "cancel" ? "Cancel this event" : "Delete permanently"}
      </Button>
    </>
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

/** The wall-clock time of a stored instant, as the picker's "HH:mm". */
function clockOf(iso: string) {
  return format(new Date(iso), "HH:mm")
}

function draftsFrom(event: EditableEvent | undefined): SlotDraft[] {
  if (!event) return []
  return [...event.slots]
    .sort((a, b) => a.slot_order - b.slot_order)
    .map((s, i) => ({
      id: String(i),
      existingId: s.id,
      label: s.label,
      start: clockOf(s.start_time),
      end: s.end_time ? clockOf(s.end_time) : "",
      requirements: Object.fromEntries(
        s.requirements.filter((r) => r.needed_count > 0).map((r) => [r.sub_team_id, r.needed_count])
      ),
      teamsOpen: false
    }))
}

/** Zeroes and absences are the same answer, so both sides are compared on what is asked for. */
function sameRequirements(a: Record<string, number>, b: Record<string, number>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) if ((a[key] ?? 0) !== (b[key] ?? 0)) return false
  return true
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
