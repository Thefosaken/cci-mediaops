"use client"

import { useMemo, useState } from "react"
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isBefore,
  startOfDay,
  startOfMonth
} from "date-fns"
import { ChevronLeft, ChevronRight, Clock, Search, Users } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { clashFor, describeClash, toIsoDate, type DutyLike } from "@/lib/utils/rostering"
import { assignDutyBulk, assignToSlots } from "@/server/actions/duties"
import { TEAM_COLORS, type TeamColor } from "./team-colors"

import { Modal } from "@/components/ui/modal"
import { Button, IconButton } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"

/**
 * Bulk rostering.
 *
 * Person first, because that is how the decision is actually made — you think "who is
 * on this month", not "which team needs filling". Their team follows from the choice
 * rather than being asked for: the system already knows it, and restating it is a step
 * that can only be got wrong.
 *
 * A day is no longer one thing. An event can own up to four services, and the rule is
 * one duty per person per service across every team — so "Sunday the 10th" might mean
 * the 8am, the 10am, both, or the whole day (which takes them off all four). The grid
 * therefore shows what a day *contains* before you commit to it, and a day with
 * services opens rather than selects.
 *
 * Impossible choices are inert, never merely rejected on submit. `clashFor` answers the
 * same question the database's exclusion constraint will, so the two agree, and
 * `describeClash` says why in the words a lead would use — a greyed date with no reason
 * is the thing that makes people stop trusting a scheduler.
 *
 * The month grid is built here rather than reusing DatePickerGrid because a day now has
 * three selection states, not two: none, some of its services, all of them. A picker
 * that cannot draw "one of the two services" would be quietly lying about what you just
 * chose.
 */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const

/** none · some of the day's services · the whole day. */
type DaySelection = "none" | "some" | "all"

export interface SchedulablePerson {
  id: string
  full_name: string
  teamIds: string[]
}

export interface SchedulableSlot {
  id: string
  label: string
  slot_order: number
  /** ISO date, no time. */
  slot_date: string
  start_time: string
  event_id: string
  event_title: string
}

/** Everything the grid needs to know about one square, resolved once per person. */
interface DayState {
  iso: string
  slots: SchedulableSlot[]
  /** Slot id → the sentence saying why this person cannot take it. */
  blockedSlots: Map<string, string>
  /** Why they cannot be put on the whole day, or null. */
  wholeDayBlocked: string | null
  /** Why nothing at all can be chosen here, or null if something can. */
  blocked: string | null
}

export function ScheduleModal({
  month,
  people,
  teams,
  colorFor,
  slots,
  existingDuties,
  canPublish,
  onClose,
  onDone,
  onError
}: {
  month: Date
  people: SchedulablePerson[]
  teams: { id: string; name: string; color: string | null }[]
  colorFor: Map<string, TeamColor>
  /** Every slot in view, across all events. */
  slots: SchedulableSlot[]
  /** Every existing duty, for clash checking. */
  existingDuties: DutyLike[]
  /** False for assistant leads — they may draft but not publish. */
  canPublish: boolean
  onClose: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const [query, setQuery] = useState("")
  const [personId, setPersonId] = useState<string | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  /** Whole-day picks, as ISO dates. Kept apart from slot picks — see `takeWholeDay`. */
  const [pickedDays, setPickedDays] = useState<Set<string>>(new Set())
  const [pickedSlots, setPickedSlots] = useState<Set<string>>(new Set())
  /** The one day whose services are showing. Only ever one, so the modal stays short. */
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [role, setRole] = useState("")
  const [asDraft, setAsDraft] = useState(!canPublish)
  const [saving, setSaving] = useState(false)
  /** The picker navigates independently of the calendar behind it. */
  const [viewMonth, setViewMonth] = useState(month)

  // Memoized not for its own cost — a `find` is nothing — but because `dayStates`
  // below depends on it. An unmemoized value in that chain makes the React Compiler
  // give up on the whole component, and this is the one component in the calendar
  // doing per-day work across a month.
  const person = useMemo(
    () => people.find((p) => p.id === personId) ?? null,
    [people, personId]
  )
  const personTeams = person ? teams.filter((t) => person.teamIds.includes(t.id)) : []
  /** One team is the common case, so it resolves silently; several needs a choice. */
  const resolvedTeam = teamId ?? (personTeams.length === 1 ? personTeams[0].id : null)
  /** An assistant lead has no published state to choose — the toggle is stuck on. */
  const draft = canPublish ? asDraft : true

  /**
   * Results only appear once you type.
   *
   * Listing everyone up front pushes the date picker below the fold and gets worse as
   * the campus grows — a search box you have to scroll past is a search box that isn't
   * doing its job. Capped, because a query matching thirty people has the same problem.
   */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return people.filter((p) => p.full_name.toLowerCase().includes(q)).slice(0, 6)
  }, [people, query])

  // Follows the picker, not the calendar behind — a weekday shortcut should act on the
  // month you are looking at.
  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) }),
    [viewMonth]
  )

  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots])

  const slotsByDate = useMemo(() => {
    const map = new Map<string, SchedulableSlot[]>()
    for (const s of slots) map.set(s.slot_date, [...(map.get(s.slot_date) ?? []), s])
    // Service order is the running order of the morning, not the order rows came back in.
    for (const list of map.values()) list.sort((a, b) => a.slot_order - b.slot_order)
    return map
  }, [slots])

  /**
   * Narrowed to this person before the grid loops over it.
   *
   * `clashFor` filters by user itself, so this is not for correctness — it is because
   * the loop below runs once per slot per day of the month, and walking every duty on
   * campus each time is work nobody asked for.
   */
  const theirDuties = useMemo(
    () => (personId ? existingDuties.filter((d) => d.user_id === personId) : []),
    [existingDuties, personId]
  )

  const dayStates = useMemo(() => {
    const out = new Map<string, DayState>()
    if (!person) return out
    const name = firstName(person.full_name)

    for (const date of days) {
      const iso = toIsoDate(date)
      const daySlots = slotsByDate.get(iso) ?? []

      // An all-day candidate overlaps every position, so a clash here also means "they
      // already have something that day" — which is what marks their existing load.
      const allDay = clashFor({ userId: person.id, dutyDate: iso, slotNo: null }, theirDuties)
      const wholeDayBlocked = allDay ? describeClash(allDay, name) : null

      const blockedSlots = new Map<string, string>()
      for (const s of daySlots) {
        const c = clashFor({ userId: person.id, dutyDate: iso, slotNo: s.slot_order }, theirDuties)
        if (c) blockedSlots.set(s.id, describeClash(c, name))
      }

      // A dateless day is blocked only by an existing duty. A day with services is
      // blocked only once every one of them is gone — until then it still has something
      // to offer and must stay tappable.
      let blocked: string | null = null
      if (daySlots.length === 0) blocked = wholeDayBlocked
      else if (blockedSlots.size === daySlots.length) {
        const only = daySlots.length === 1 ? blockedSlots.get(daySlots[0].id) : null
        blocked =
          allDay?.kind === "blocked_by_all_day"
            ? wholeDayBlocked
            : (only ?? `${name} is already on every service that day`)
      }

      out.set(iso, { iso, slots: daySlots, blockedSlots, wholeDayBlocked, blocked })
    }

    return out
  }, [days, person, slotsByDate, theirDuties])

  const openState = openDay ? (dayStates.get(openDay) ?? null) : null
  const today = startOfDay(new Date())
  const total = pickedDays.size + pickedSlots.size

  /** Days this month they are already spoken for, whether or not anything is left. */
  const alreadyCount = [...dayStates.values()].filter((s) => s.wholeDayBlocked !== null).length

  const selectionOn = (iso: string): DaySelection => {
    if (pickedDays.has(iso)) return "all"
    const daySlots = slotsByDate.get(iso) ?? []
    const n = daySlots.filter((s) => pickedSlots.has(s.id)).length
    if (n === 0) return "none"
    return n === daySlots.length ? "all" : "some"
  }

  const selectPerson = (id: string) => {
    setPersonId(id)
    setTeamId(null)
    // Days already picked belong to the previous person's rota, not this one.
    setPickedDays(new Set())
    setPickedSlots(new Set())
    setOpenDay(null)
  }

  /**
   * A whole day and one of its services cannot both be chosen: the all-day duty covers
   * every position, so the pair would clash with itself before it ever reached Postgres.
   * Picking either therefore clears the other for that date.
   */
  const takeWholeDay = (iso: string) => {
    const state = dayStates.get(iso)
    if (state?.wholeDayBlocked) return
    setPickedSlots((prev) => {
      const next = new Set(prev)
      for (const s of state?.slots ?? []) next.delete(s.id)
      return next
    })
    setPickedDays((prev) => {
      const next = new Set(prev)
      if (next.has(iso)) next.delete(iso)
      else next.add(iso)
      return next
    })
  }

  const takeSlot = (slot: SchedulableSlot) => {
    if (dayStates.get(slot.slot_date)?.blockedSlots.has(slot.id)) return
    setPickedDays((prev) => {
      if (!prev.has(slot.slot_date)) return prev
      const next = new Set(prev)
      next.delete(slot.slot_date)
      return next
    })
    setPickedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(slot.id)) next.delete(slot.id)
      else next.add(slot.id)
      return next
    })
  }

  /** A day with services opens; a bare day selects. Tapping is the same gesture either way. */
  const tapDay = (iso: string) => {
    const state = dayStates.get(iso)
    if (!state || state.blocked) return
    if (state.slots.length === 0) {
      setOpenDay(null)
      takeWholeDay(iso)
      return
    }
    setOpenDay(openDay === iso ? null : iso)
  }

  /**
   * The weekday letter still means "every Sunday in August", but what that buys you now
   * depends on the month: every service where the services are laid out, the bare day
   * where they are not. Which is the right answer — an all-day duty on a day that has
   * three services would take the person off all three.
   */
  const pickWeekday = (weekday: number) => {
    const targets = days.filter((d) => d.getDay() === weekday).map(toIsoDate)
    const slotIds: string[] = []
    const dates: string[] = []

    for (const iso of targets) {
      const state = dayStates.get(iso)
      if (!state || state.blocked) continue
      if (state.slots.length > 0) {
        for (const s of state.slots) if (!state.blockedSlots.has(s.id)) slotIds.push(s.id)
      } else if (!state.wholeDayBlocked) dates.push(iso)
    }

    if (slotIds.length === 0 && dates.length === 0) return

    const allOn =
      slotIds.every((id) => pickedSlots.has(id)) && dates.every((d) => pickedDays.has(d))

    setPickedSlots((prev) => {
      const next = new Set(prev)
      for (const id of slotIds) {
        if (allOn) next.delete(id)
        else next.add(id)
      }
      return next
    })
    setPickedDays((prev) => {
      const next = new Set(prev)
      for (const d of dates) {
        if (allOn) next.delete(d)
        else next.add(d)
      }
      // Any whole-day pick on a day we have just filled with services would self-clash.
      if (!allOn) for (const iso of targets) if (slotsByDate.has(iso)) next.delete(iso)
      return next
    })
  }

  const submit = async () => {
    if (!person || !resolvedTeam) return
    setSaving(true)

    const common = {
      userId: person.id,
      subTeamId: resolvedTeam,
      roleTitle: role.trim() || undefined,
      asDraft: draft
    }

    let added = 0
    const rejected: string[] = []

    /**
     * Two calls, because a slot duty and an all-day duty are different rows with
     * different date semantics. A failure from either is folded into `rejected` rather
     * than returned immediately: by the time the second call runs the first may already
     * have written rows, and "it failed" would be a lie about work that landed.
     */
    if (pickedSlots.size > 0) {
      const res = await assignToSlots({ ...common, slotIds: [...pickedSlots] })
      if (res.error) rejected.push(res.error)
      else {
        added += res.added ?? 0
        rejected.push(...(res.rejected ?? []))
      }
    }

    if (pickedDays.size > 0) {
      const res = await assignDutyBulk({ ...common, dates: [...pickedDays].sort() })
      if (res.error) rejected.push(res.error)
      else {
        added += res.added ?? 0
        rejected.push(...(res.rejected ?? []))
      }
    }

    setSaving(false)

    if (added === 0) return onError(rejected[0] ?? "Nothing could be scheduled")

    const noun = countedNoun(added, pickedSlots.size > 0, pickedDays.size > 0)
    // The server's rejection strings are already sentences a lead can act on — quoting
    // them beats summarising them into "some were skipped".
    const tail =
      rejected.length === 0
        ? ""
        : rejected.length === 1
          ? ` · 1 skipped (${rejected[0]})`
          : ` · ${rejected.length} skipped (${rejected[0]}, and ${rejected.length - 1} more)`

    onDone(`${person.full_name} scheduled for ${noun}${draft ? " in draft" : ""}${tail}`)
  }

  const palette = resolvedTeam ? TEAM_COLORS[colorFor.get(resolvedTeam) ?? "blue"] : null

  /**
   * Reads as dates rather than a count: "3 Aug First Service, 10 Aug both services" is
   * checkable at a glance, "5 selections" is not. Collapses to a count once the list
   * would be longer than the line.
   */
  const summary = (() => {
    const dates = new Set<string>(pickedDays)
    for (const id of pickedSlots) {
      const s = slotById.get(id)
      if (s) dates.add(s.slot_date)
    }
    const sorted = [...dates].sort()
    if (sorted.length === 0) return ""
    if (sorted.length > 4) return `${total} selected across ${sorted.length} days`

    return sorted
      .map((iso) => {
        const when = format(new Date(`${iso}T12:00:00`), "d MMM")
        if (pickedDays.has(iso)) return `${when} all day`
        const daySlots = slotsByDate.get(iso) ?? []
        const chosen = daySlots.filter((s) => pickedSlots.has(s.id))
        if (daySlots.length > 1 && chosen.length === daySlots.length) {
          return `${when} ${daySlots.length === 2 ? "both services" : `all ${daySlots.length} services`}`
        }
        return `${when} ${chosen.map((s) => s.label).join(" & ")}`
      })
      .join(", ")
  })()

  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule people"
      description={format(month, "MMMM yyyy")}
      size="default"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={!person || !resolvedTeam || total === 0}
            onClick={submit}
          >
            {draft
              ? `Save${total > 0 ? ` ${total}` : ""} to draft`
              : `Schedule${total > 0 ? ` ${total}` : ""}`}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* ── Who ─────────────────────────────────────────────── */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            Who
          </h3>

          {person ? (
            // Chosen: collapses to a single row so the month grid gets the space.
            <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[11px] font-semibold text-foreground">
                {initials(person.full_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-foreground">
                  {person.full_name}
                </span>
                {personTeams.length <= 1 ? (
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted">
                    {palette && <span className={cn("size-2 rounded-full", palette.dot)} />}
                    {personTeams[0]?.name ?? "No team"}
                  </span>
                ) : (
                  // Only asked when the answer is genuinely ambiguous.
                  <span className="mt-1 flex flex-wrap gap-1">
                    {personTeams.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTeamId(t.id)}
                        className={cn(
                          "flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] transition-colors",
                          resolvedTeam === t.id
                            ? "bg-primary text-[var(--color-primary-foreground)]"
                            : "bg-[var(--surface-subtle)] text-muted hover:text-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            TEAM_COLORS[colorFor.get(t.id) ?? "blue"].dot
                          )}
                        />
                        {t.name}
                      </button>
                    ))}
                  </span>
                )}
              </span>
              <Button size="xs" variant="ghost" onClick={() => setPersonId(null)}>
                Change
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people…"
                  className="pl-8"
                  autoFocus
                />
              </div>

              {query.trim() === "" ? (
                <p className="mt-2 px-1 text-[11.5px] text-faint">
                  {people.length} {people.length === 1 ? "person" : "people"} available — start
                  typing to find someone.
                </p>
              ) : filtered.length === 0 ? (
                <p className="mt-2 px-1 text-[11.5px] text-faint">
                  Nobody matches “{query.trim()}”
                </p>
              ) : (
                <ul className="mt-2 space-y-0.5">
                {filtered.map((p) => {
                  const theirTeams = teams.filter((t) => p.teamIds.includes(t.id))
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => selectPerson(p.id)}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-subtle"
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--surface-subtle)] text-[10px] font-semibold text-muted">
                          {initials(p.full_name)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                          {p.full_name}
                        </span>
                        {/* Their team shows before you pick, so the list is scannable
                            by team without a separate filter. */}
                        <span className="flex shrink-0 items-center gap-1">
                          {theirTeams.length === 0 ? (
                            <span className="text-[11px] text-faint">No team</span>
                          ) : (
                            theirTeams.map((t) => (
                              <span
                                key={t.id}
                                title={t.name}
                                className={cn(
                                  "size-2 rounded-full",
                                  TEAM_COLORS[colorFor.get(t.id) ?? "blue"].dot
                                )}
                              />
                            ))
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
                </ul>
              )}
            </>
          )}
        </section>

        {/* ── When ────────────────────────────────────────────── */}
        <section className={cn(!person && "pointer-events-none opacity-40")}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            When
          </h3>

          <div className="rounded-md border border-border bg-surface p-3.5">
            {/* Month navigation — scheduling often spans a month boundary, and being
                locked to whatever the calendar behind was showing made that impossible. */}
            <div className="mb-2.5 flex items-center justify-between">
              <IconButton
                label="Previous month"
                size="xs"
                variant="ghost"
                onClick={() => {
                  setViewMonth(addMonths(viewMonth, -1))
                  setOpenDay(null)
                }}
              >
                <ChevronLeft className="size-3.5" />
              </IconButton>
              <span className="text-[13px] font-medium text-foreground">
                {format(viewMonth, "MMMM yyyy")}
              </span>
              <IconButton
                label="Next month"
                size="xs"
                variant="ghost"
                onClick={() => {
                  setViewMonth(addMonths(viewMonth, 1))
                  setOpenDay(null)
                }}
              >
                <ChevronRight className="size-3.5" />
              </IconButton>
            </div>

            {/* Weekday headers, sitting over the columns they act on — so it is obvious
                that tapping "S" selects every Sunday rather than decorating the row. */}
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickWeekday(i)}
                  title={`Select every ${format(new Date(2024, 0, 7 + i), "EEEE")}`}
                  className="grid h-6 place-items-center rounded text-[10.5px] font-semibold uppercase tracking-wide
                             text-muted transition-colors duration-100 hover:bg-surface-subtle hover:text-foreground"
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: startOfMonth(viewMonth).getDay() }).map((_, i) => (
                <span key={`pad-${i}`} />
              ))}

              {days.map((d) => {
                const iso = toIsoDate(d)
                const state = dayStates.get(iso) ?? null
                const blocked = state?.blocked ?? null
                const daySlots = state?.slots ?? []
                const chosen = selectionOn(iso)
                const expanded = openDay === iso
                const past = isBefore(d, today)
                const isToday = d.getTime() === today.getTime()

                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={blocked !== null}
                    onClick={() => tapDay(iso)}
                    aria-expanded={daySlots.length > 0 ? expanded : undefined}
                    // The reason travels with the cell. A date that cannot be picked and
                    // will not say why is worse than one that errors on submit.
                    title={
                      blocked ??
                      (daySlots.length > 0
                        ? `${daySlots.length} service${daySlots.length === 1 ? "" : "s"} — tap to choose`
                        : undefined)
                    }
                    className={cn(
                      "relative grid aspect-square place-items-center rounded-md text-[13px] tabular-nums",
                      "transition-[background-color,color,box-shadow] duration-100 ease-[var(--ease-out-quart)]",
                      blocked
                        ? "cursor-not-allowed text-faint"
                        : chosen === "all"
                          ? "bg-primary font-semibold text-[var(--color-primary-foreground)]"
                          : chosen === "some"
                            ? "bg-[var(--color-primary-soft)] font-medium text-foreground"
                            : cn(
                                "hover:bg-surface-subtle hover:text-foreground",
                                // Past days recede by colour, not opacity. At 45% opacity
                                // most of a month reads as disabled — on the 19th, two
                                // thirds of the grid looked broken rather than merely
                                // behind us. They stay fully selectable; backfilling a
                                // rota is legitimate.
                                past ? "text-faint" : "text-foreground"
                              ),
                      expanded && "ring-2 ring-inset ring-primary",
                      isToday && chosen === "none" && !expanded && "ring-1 ring-inset ring-border-strong"
                    )}
                  >
                    {format(d, "d")}

                    {/* One pip per service, so a day announces what it holds before you
                        open it — and, once open, which of them you have taken. */}
                    {state && blocked ? (
                      <span
                        aria-hidden
                        className={cn("absolute bottom-1 size-1 rounded-full", palette?.dot ?? "bg-muted")}
                      />
                    ) : state && daySlots.length > 0 && chosen !== "all" ? (
                      <span aria-hidden className="absolute bottom-1 flex gap-[2px]">
                        {daySlots.map((s) => (
                          <span
                            key={s.id}
                            className={cn(
                              "size-1 rounded-full",
                              pickedSlots.has(s.id)
                                ? "bg-primary"
                                : state.blockedSlots.has(s.id)
                                  ? "bg-border-strong"
                                  : "bg-muted"
                            )}
                          />
                        ))}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {/* The day's services, opened in place. A popover would cover the grid you
                are working across; this keeps the month and the choice on screen at once. */}
            {openState && openState.slots.length > 0 && (
              <div className="mt-3 rounded-md border border-border-subtle bg-[var(--surface-subtle)] p-2.5">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted">
                  <Clock className="size-3 shrink-0 text-faint" />
                  <span>{format(new Date(`${openState.iso}T12:00:00`), "EEEE d MMMM")}</span>
                  <span className="truncate text-faint">· {eventNames(openState.slots)}</span>
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {openState.slots.map((s) => {
                    const why = openState.blockedSlots.get(s.id) ?? null
                    const on = pickedSlots.has(s.id)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={why !== null}
                        onClick={() => takeSlot(s)}
                        title={why ?? `${s.event_title} — ${s.label}, ${slotTime(s.start_time)}`}
                        className={cn(
                          "rounded-md border px-2 py-1 text-[11.5px] transition-colors duration-100",
                          why
                            ? "cursor-not-allowed border-border-subtle bg-transparent text-faint"
                            : on
                              ? "border-primary bg-primary font-medium text-[var(--color-primary-foreground)]"
                              : "border-border bg-surface text-foreground hover:border-border-strong"
                        )}
                      >
                        {s.label} · {slotTime(s.start_time)}
                      </button>
                    )
                  })}

                  {/* Still reachable when services exist, because "on all morning" is a
                      real answer — but it is spelled out rather than implied by tapping
                      the date, which is how people used to book it by accident. */}
                  <button
                    type="button"
                    disabled={openState.wholeDayBlocked !== null}
                    onClick={() => takeWholeDay(openState.iso)}
                    title={
                      openState.wholeDayBlocked ??
                      "One duty covering the day — it takes them off every service on it"
                    }
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11.5px] transition-colors duration-100",
                      openState.wholeDayBlocked
                        ? "cursor-not-allowed border-border-subtle bg-transparent text-faint"
                        : pickedDays.has(openState.iso)
                          ? "border-primary bg-primary font-medium text-[var(--color-primary-foreground)]"
                          : "border-border bg-surface text-foreground hover:border-border-strong"
                    )}
                  >
                    Whole day
                  </button>
                </div>

                <p className="mt-2 text-[11px] leading-relaxed text-faint">
                  Whole day blocks every service that day — pick services instead to leave
                  the rest of the morning free.
                </p>

                {/* Said out loud as well as on hover: a tooltip nobody hovers is a reason
                    nobody reads. */}
                {reasonsFor(openState).map((why) => (
                  <p key={why} className="mt-1 text-[11px] leading-relaxed text-muted">
                    {why}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Says what will happen, in the words you'd use out loud. */}
          <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted">
            <Users className="mt-0.5 size-3.5 shrink-0 text-faint" />
            {total === 0 ? (
              alreadyCount > 0 ? (
                <span>
                  Already on {alreadyCount} day{alreadyCount === 1 ? "" : "s"} this month. Tap a
                  day to choose its services, or a weekday letter for the whole column.
                </span>
              ) : (
                <span>
                  Tap a day to choose its services, or a weekday letter for the whole column.
                </span>
              )
            ) : (
              <span>
                <span className="font-medium text-foreground">{summary}</span>
              </span>
            )}
          </p>
        </section>

        {/* ── Doing what ──────────────────────────────────────── */}
        <section className={cn(!person && "pointer-events-none opacity-40")}>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Role
            </h3>
            <span className="text-[11px] text-faint">Optional</span>
          </div>
          <Input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Running overflow screen, lyrics, camera 2…"
          />
          <p className="mt-1.5 text-[11.5px] text-muted">
            Applies to every service selected. You can change it per duty afterwards.
          </p>
        </section>

        {/* ── Draft or live ───────────────────────────────────── */}
        <section className="rounded-md border border-border bg-[var(--surface-subtle)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="save-as-draft"
              className="flex items-center gap-2 text-[13px] text-foreground"
            >
              Save as draft
              {draft && (
                <Badge variant="muted" size="sm">
                  not published
                </Badge>
              )}
            </label>
            <Switch
              id="save-as-draft"
              checked={draft}
              disabled={!canPublish}
              onChange={setAsDraft}
              label="Save as draft"
            />
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
            {!canPublish
              ? "An assistant lead builds the roster and the lead publishes it, so this stays a draft. Nobody is notified until they publish."
              : draft
                ? "Nobody is notified until the roster is published."
                : "Everyone selected is notified as soon as you save."}
          </p>
        </section>
      </div>
    </Modal>
  )
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}

/** Clash sentences read better with a first name — "Ada is on Sound all day". */
function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

/**
 * `start_time` arrives either as a timestamp or as a bare clock time depending on how
 * the slot was created, and `new Date("08:00:00")` is not a date. Handled here rather
 * than trusted, because a service labelled "Invalid Date" is worse than no time at all.
 */
function slotTime(raw: string) {
  const clock = /^(\d{1,2}):(\d{2})/.exec(raw)
  if (clock) return format(new Date(1970, 0, 1, Number(clock[1]), Number(clock[2])), "h:mm a")
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? raw : format(d, "h:mm a")
}

/** The events a day's services belong to, named once each. */
function eventNames(slots: SchedulableSlot[]) {
  return [...new Set(slots.map((s) => s.event_title))].join(", ")
}

/** Every distinct reason something on this day is out of reach, said once. */
function reasonsFor(state: DayState) {
  const all = [...state.blockedSlots.values()]
  if (state.wholeDayBlocked && state.blockedSlots.size === 0) all.push(state.wholeDayBlocked)
  return [...new Set(all)]
}

/** "5 services", "1 day", "6 duties" — the plural the selection actually earned. */
function countedNoun(n: number, hadSlots: boolean, hadDays: boolean) {
  const word = hadSlots && hadDays ? "duty" : hadSlots ? "service" : "day"
  const plural = word === "duty" ? "duties" : `${word}s`
  return `${n} ${n === 1 ? word : plural}`
}
