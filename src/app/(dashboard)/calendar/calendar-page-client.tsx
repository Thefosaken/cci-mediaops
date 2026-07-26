"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek
} from "date-fns"
import {
  Calendar as CalendarIcon,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { useToast } from "@/lib/toast/toast-context"
import { removeDuty, respondToDuty, setDutyRole } from "@/server/actions/duties"
import { shortfall, coverageForSlot, toIsoDate, type DutyLike } from "@/lib/utils/rostering"
import { resolveTeamColor, TEAM_COLORS, type TeamColor } from "./team-colors"
import { MonthGrid, WeekGrid, type CalendarEntry } from "./calendar-grid"
import { DayPopover, type PopoverEvent } from "./day-popover"
import { ScheduleModal, type SchedulableSlot } from "./schedule-modal"
import { EventModal, type EditableEvent } from "./event-modal"
import { PublishBar } from "./publish-bar"
import { CopyRosterModal, type CopyableSlot } from "./copy-roster-modal"
import { RunSheetLauncher } from "./run-sheet-launcher"

import { PageHeader } from "@/components/ui/page-header"
import { Button, IconButton } from "@/components/ui/button"

/**
 * Calendar.
 *
 * Follows the model Google and Notion share: a month grid by default with a week view
 * available, a rail of toggleable calendars, and a day panel for detail. The
 * multi-account overlay maps onto sub-teams — each team has a stable colour, admins
 * see every team at once, everyone else starts on their own.
 *
 * Four things live here: services (events and the slots inside them), duties (who is
 * rostered, and to which service), coverage (whether a service is actually staffed),
 * and a link through to a slot's run sheet.
 *
 * Everything that mutates is a modal or a popover action; this component owns which
 * one is open and nothing else. State that survives a refresh belongs on the server.
 */

interface SlotRow {
  id: string
  label: string
  slot_order: number
  slot_date: string
  start_time: string
  end_time: string | null
  notes: string | null
  event_slot_requirements: { sub_team_id: string; needed_count: number }[]
}

interface EventRow {
  id: string
  title: string
  event_type: string
  description: string | null
  start_time: string
  end_time: string | null
  status: string
  location: string | null
  recurrence_group_id: string | null
  event_sub_teams: { sub_team_id: string }[]
  event_slots: SlotRow[]
}

interface DutyRow {
  id: string
  user_id: string
  sub_team_id: string
  slot_id: string | null
  slot_no: number | null
  duty_date: string
  event_id: string | null
  role_title: string | null
  call_time: string | null
  status: string
  publish_state: string
  users: { id: string; full_name: string } | null
  sub_teams: { id: string; name: string; color: string | null } | null
}

interface Props {
  events: EventRow[]
  subTeams: { id: string; name: string; color: string | null }[]
  duties: DutyRow[]
  runSheets: { id: string; title: string; event_id: string | null; slot_id: string | null; sheet_date: string | null }[]
  templates: { id: string; title: string }[]
  users: { id: string; full_name: string }[]
  memberships: { user_id: string; sub_team_id: string }[]
  myTeamIds: string[]
  currentUserId: string
  canSchedule: boolean
  canEditEvents: boolean
  canDeleteEvents: boolean
  canCreateRunSheet: boolean
  canPublish: boolean
  seesAllTeams: boolean
}

type View = "month" | "week"

export function CalendarPageClient({
  events,
  subTeams,
  duties,
  runSheets,
  templates,
  users,
  memberships,
  myTeamIds,
  currentUserId,
  canSchedule,
  canEditEvents,
  canDeleteEvents,
  canCreateRunSheet,
  canPublish,
  seesAllTeams
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  const [view, setView] = useState<View>("month")
  const [cursor, setCursor] = useState(() => new Date())
  // The anchor rect travels with the selection so the popover can position itself.
  const [selected, setSelected] = useState<{ date: Date; anchor: DOMRect } | null>(null)

  /** Only one of these is ever open; each carries the context it needs to act. */
  const [scheduling, setScheduling] = useState<{ slotId?: string } | null>(null)
  const [creatingEvent, setCreatingEvent] = useState<Date | null>(null)
  const [editingEvent, setEditingEvent] = useState<string | null>(null)
  const [copyingTo, setCopyingTo] = useState<string | null>(null)
  const [launchingSheet, setLaunchingSheet] = useState<string | null>(null)

  /**
   * Which team calendars are showing. Admins start with all of them overlaid — the
   * multi-account view — while everyone else starts on their own team, since that is
   * the rota they work from.
   */
  const [visibleTeams, setVisibleTeams] = useState<Set<string>>(() =>
    seesAllTeams || myTeamIds.length === 0
      ? new Set(subTeams.map((t) => t.id))
      : new Set(myTeamIds)
  )
  const [showEvents, setShowEvents] = useState(true)
  /** The fastest answer to "when am I on duty" on a busy overlay. */
  const [onlyMine, setOnlyMine] = useState(false)
  /** Drafts are noise while reading the published rota and the point while building it. */
  const [showDrafts, setShowDrafts] = useState(true)

  const colorFor = useMemo(() => {
    const map = new Map<string, TeamColor>()
    subTeams.forEach((t, i) => map.set(t.id, resolveTeamColor(t.color, i)))
    return map
  }, [subTeams])

  const days = useMemo(() => {
    if (view === "week") {
      return eachDayOfInterval({ start: startOfWeek(cursor), end: endOfWeek(cursor) })
    }
    // Always six rows, so the grid keeps a constant height month to month.
    const start = startOfWeek(startOfMonth(cursor))
    return eachDayOfInterval({ start, end: addWeeks(start, 6) }).slice(0, 42)
  }, [cursor, view])

  /** Every slot in the campus, flattened once and reused by four different surfaces. */
  const allSlots = useMemo(
    () =>
      events.flatMap((e) =>
        e.event_slots.map((s) => ({ ...s, event_id: e.id, event_title: e.title, event_status: e.status }))
      ),
    [events]
  )

  const dutiesBySlot = useMemo(() => {
    const map = new Map<string, DutyRow[]>()
    for (const d of duties) {
      if (!d.slot_id) continue
      map.set(d.slot_id, [...(map.get(d.slot_id) ?? []), d])
    }
    return map
  }, [duties])

  const visibleDuties = useMemo(
    () => (showDrafts ? duties : duties.filter((d) => d.publish_state !== "draft")),
    [duties, showDrafts]
  )

  const entriesByDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>()
    const push = (d: Date, e: CalendarEntry) => {
      const key = d.toDateString()
      map.set(key, [...(map.get(key) ?? []), e])
    }

    if (showEvents && !onlyMine) {
      for (const ev of events) {
        const at = new Date(ev.start_time)
        /**
         * A service that is short-staffed says so on the month grid rather than only
         * inside the popover. The whole reason to open a calendar in the week before
         * Sunday is to find the gaps, and a gap you have to click to discover is one
         * you find on Saturday night.
         */
        const gaps = ev.event_slots.reduce(
          (sum, s) =>
            sum +
            shortfall(
              coverageForSlot(
                s.event_slot_requirements,
                (dutiesBySlot.get(s.id) ?? []).map((d) => ({
                  sub_team_id: d.sub_team_id,
                  status: d.status
                }))
              )
            ),
          0
        )

        const services = ev.event_slots.length
        push(at, {
          id: `event-${ev.id}`,
          kind: "event",
          date: at,
          label: ev.title,
          meta:
            gaps > 0
              ? `${format(at, "h:mm a")} · ${gaps} needed`
              : services > 1
                ? `${format(at, "h:mm a")} · ${services} services`
                : format(at, "h:mm a"),
          color: null,
          dimmed: ev.status === "cancelled"
        })
      }
    }

    for (const d of visibleDuties) {
      if (!visibleTeams.has(d.sub_team_id)) continue
      const mine = d.user_id === currentUserId
      if (onlyMine && !mine) continue

      // Midday avoids any timezone drift pushing a date-only duty onto the wrong day.
      const at = new Date(`${d.duty_date}T12:00:00`)
      const slot = d.slot_id ? allSlots.find((s) => s.id === d.slot_id) : null

      push(at, {
        id: `duty-${d.id}`,
        kind: "duty",
        date: at,
        label: d.users?.full_name ?? "Unassigned",
        // Which service matters more than which team on a day running several — the
        // colour already carries the team.
        meta: slot ? slot.label : d.sub_teams?.name,
        color: colorFor.get(d.sub_team_id) ?? null,
        mine,
        dimmed: d.status === "declined" || d.publish_state === "draft"
      })
    }

    return map
  }, [
    events,
    visibleDuties,
    visibleTeams,
    showEvents,
    onlyMine,
    currentUserId,
    colorFor,
    allSlots,
    dutiesBySlot
  ])

  const selectedDay = useMemo(() => {
    if (!selected) return null
    const day = selected.date
    const iso = toIsoDate(day)

    return {
      date: day,
      events: events
        .filter((e) => isSameDay(new Date(e.start_time), day))
        .map(
          (e): PopoverEvent => ({
            id: e.id,
            title: e.title,
            start_time: e.start_time,
            location: e.location,
            status: e.status,
            slots: [...e.event_slots]
              .sort((a, b) => a.slot_order - b.slot_order)
              .map((s) => ({
                id: s.id,
                label: s.label,
                slot_order: s.slot_order,
                start_time: s.start_time,
                requirements: s.event_slot_requirements
              }))
          })
        ),
      duties: visibleDuties.filter((d) => d.duty_date === iso)
    }
  }, [selected, events, visibleDuties])

  /** Teams this user may roster into. Leads and assistants stay inside their own. */
  const assignableTeams = useMemo(
    () => (seesAllTeams ? subTeams : subTeams.filter((t) => myTeamIds.includes(t.id))),
    [seesAllTeams, subTeams, myTeamIds]
  )

  /**
   * Who can be scheduled, each carrying their team memberships so the modal can
   * resolve the team from the person instead of asking twice.
   *
   * A lead sees only their own team's members — assigning someone else's people is
   * not their call, and a list of the whole campus makes finding their own harder.
   */
  const schedulablePeople = useMemo(() => {
    const teamsByUser = new Map<string, string[]>()
    for (const m of memberships) {
      teamsByUser.set(m.user_id, [...(teamsByUser.get(m.user_id) ?? []), m.sub_team_id])
    }

    const assignableIds = new Set(assignableTeams.map((t) => t.id))

    return users
      .map((u) => ({ ...u, teamIds: teamsByUser.get(u.id) ?? [] }))
      .filter((u) => (seesAllTeams ? true : u.teamIds.some((id) => assignableIds.has(id))))
  }, [users, memberships, assignableTeams, seesAllTeams])

  /**
   * Every duty, published or draft, for clash checking.
   *
   * Deliberately not `visibleDuties`: hiding drafts is a reading preference, and a
   * draft that would double-book somebody still will once published. Checking against
   * what is on screen rather than what exists would let the toggle change what is
   * possible.
   */
  const clashSource = useMemo<DutyLike[]>(
    () =>
      duties.map((d) => ({
        user_id: d.user_id,
        duty_date: d.duty_date,
        slot_no: d.slot_no,
        sub_teams: d.sub_teams,
        role_title: d.role_title
      })),
    [duties]
  )

  const schedulableSlots = useMemo<SchedulableSlot[]>(
    () =>
      allSlots
        .filter((s) => s.event_status !== "cancelled")
        .map((s) => ({
          id: s.id,
          label: s.label,
          slot_order: s.slot_order,
          slot_date: s.slot_date,
          start_time: s.start_time,
          event_id: s.event_id,
          event_title: s.event_title
        })),
    [allSlots]
  )

  /** Slots with their rosters attached, for the copy-from picker's preview. */
  const copyableSlots = useMemo<CopyableSlot[]>(
    () =>
      allSlots.map((s) => ({
        id: s.id,
        label: s.label,
        slot_order: s.slot_order,
        slot_date: s.slot_date,
        event_id: s.event_id,
        event_title: s.event_title,
        duties: (dutiesBySlot.get(s.id) ?? []).map((d) => ({
          user_id: d.user_id,
          sub_team_id: d.sub_team_id,
          full_name: d.users?.full_name ?? "Unknown",
          role_title: d.role_title
        }))
      })),
    [allSlots, dutiesBySlot]
  )

  /** The visible range — publishing acts on exactly what is on screen, nothing more. */
  const windowStart = view === "week" ? startOfWeek(cursor) : startOfWeek(startOfMonth(cursor))
  const windowEnd = view === "week" ? endOfWeek(cursor) : days[days.length - 1]

  const drafts = useMemo(() => {
    const from = toIsoDate(windowStart)
    const to = toIsoDate(windowEnd)
    const inWindow = duties.filter(
      (d) => d.publish_state === "draft" && d.duty_date >= from && d.duty_date <= to
    )

    const byTeam: Record<string, number> = {}
    for (const d of inWindow) byTeam[d.sub_team_id] = (byTeam[d.sub_team_id] ?? 0) + 1

    return {
      total: inWindow.length,
      byTeam,
      peopleCount: new Set(inWindow.map((d) => d.user_id)).size
    }
  }, [duties, windowStart, windowEnd])

  const runSheetForSlot = useMemo(() => {
    const map = new Map<string, { id: string; title: string }>()
    for (const r of runSheets) if (r.slot_id) map.set(r.slot_id, { id: r.id, title: r.title })
    return map
  }, [runSheets])

  const slotById = useMemo(() => new Map(allSlots.map((s) => [s.id, s])), [allSlots])

  const title =
    view === "month"
      ? format(cursor, "MMMM yyyy")
      : `${format(startOfWeek(cursor), "d MMM")} – ${format(endOfWeek(cursor), "d MMM yyyy")}`

  const step = (dir: -1 | 1) =>
    setCursor((c) => (view === "month" ? addMonths(c, dir) : addWeeks(c, dir)))

  /** Every mutation ends the same way: report, then refetch from the server. */
  const run = (action: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const res = await action()
      if (res.error) toast.error(res.error)
      else router.refresh()
    })

  const settle = (message: string) => {
    toast.success(message)
    router.refresh()
  }

  const copyTarget = copyingTo ? copyableSlots.find((s) => s.id === copyingTo) : null
  const launchTarget = launchingSheet ? slotById.get(launchingSheet) : null

  /**
   * The event being edited, reshaped for the composer.
   *
   * Read from the same `events` array the grid draws from rather than refetched: it
   * already carries the slots and their requirements, and a second read would open the
   * form on a version of the day the person is not looking at.
   */
  const editTarget = useMemo<EditableEvent | null>(() => {
    const row = editingEvent ? events.find((e) => e.id === editingEvent) : null
    if (!row) return null
    return {
      id: row.id,
      title: row.title,
      event_type: row.event_type,
      description: row.description,
      location: row.location,
      start_time: row.start_time,
      end_time: row.end_time,
      status: row.status,
      recurrence_group_id: row.recurrence_group_id,
      slots: row.event_slots.map((s) => ({
        id: s.id,
        label: s.label,
        slot_order: s.slot_order,
        slot_date: s.slot_date,
        start_time: s.start_time,
        end_time: s.end_time,
        requirements: s.event_slot_requirements
      }))
    }
  }, [editingEvent, events])

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <PageHeader
        title="Calendar"
        description="Services, duties and who is on when"
        icon={<CalendarIcon />}
        actions={
          <div className="flex items-center gap-2">
            {canEditEvents && (
              <Button size="sm" variant="secondary" onClick={() => setCreatingEvent(new Date())}>
                <CalendarPlus className="size-4" /> New event
              </Button>
            )}
            {canSchedule && (
              <Button size="sm" onClick={() => setScheduling({})}>
                <Plus className="size-4" /> Schedule people
              </Button>
            )}
          </div>
        }
      />

      <PublishBar
        drafts={drafts}
        teams={assignableTeams}
        colorFor={colorFor}
        windowStart={windowStart}
        windowEnd={windowEnd}
        canPublish={canPublish}
        showingDrafts={showDrafts}
        onToggleShowDrafts={() => setShowDrafts((v) => !v)}
        onDone={settle}
        onError={toast.error}
      />

      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-2.5 sm:px-6">
        <div className="flex items-center gap-1">
          <IconButton label="Previous" size="sm" variant="ghost" onClick={() => step(-1)}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton label="Next" size="sm" variant="ghost" onClick={() => step(1)}>
            <ChevronRight className="size-4" />
          </IconButton>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>
            Today
          </Button>
        </div>

        <h2 className="min-w-0 text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyMine((v) => !v)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors duration-150",
              onlyMine
                ? "border-primary bg-primary text-[var(--color-primary-foreground)]"
                : "border-border bg-surface text-muted hover:text-foreground"
            )}
          >
            Only mine
          </button>

          <div className="flex items-center gap-0.5 rounded-md bg-[var(--color-canvas)] p-0.5">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded px-2.5 py-1 text-[12px] font-medium capitalize transition-colors duration-150",
                  view === v
                    ? "bg-surface text-foreground shadow-[var(--shadow-sm)]"
                    : "text-muted hover:text-foreground"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Calendar rail ───────────────────────────────────── */}
        <aside className="hidden w-[200px] shrink-0 overflow-y-auto border-r border-border p-3 lg:block">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint">
            Calendars
          </p>
          <Toggle
            label="Services"
            checked={showEvents}
            onChange={() => setShowEvents((v) => !v)}
            swatch="bg-muted"
          />

          <p className="mb-2 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint">
            Teams
          </p>
          <div className="space-y-0.5">
            {subTeams.map((t) => (
              <Toggle
                key={t.id}
                label={t.name}
                checked={visibleTeams.has(t.id)}
                swatch={TEAM_COLORS[colorFor.get(t.id) ?? "blue"].dot}
                onChange={() =>
                  setVisibleTeams((prev) => {
                    const next = new Set(prev)
                    if (next.has(t.id)) next.delete(t.id)
                    else next.add(t.id)
                    return next
                  })
                }
              />
            ))}
          </div>
        </aside>

        {/* ── Grid ────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {view === "month" ? (
            <MonthGrid
              days={days}
              month={cursor}
              entriesByDay={entriesByDay}
              selected={selected?.date ?? null}
              onSelectDay={(d, anchor) => setSelected({ date: d, anchor })}
            />
          ) : (
            <WeekGrid
              days={days}
              entriesByDay={entriesByDay}
              selected={selected?.date ?? null}
              onSelectDay={(d, anchor) => setSelected({ date: d, anchor })}
            />
          )}
        </div>
      </div>

      {/* ── Day detail ────────────────────────────────────────── */}
      {selectedDay && selected && (
        <DayPopover
          date={selectedDay.date}
          anchor={selected.anchor}
          events={selectedDay.events}
          duties={selectedDay.duties}
          teams={subTeams}
          runSheetFor={(slotId) => runSheetForSlot.get(slotId)}
          colorFor={colorFor}
          currentUserId={currentUserId}
          canSchedule={canSchedule}
          canEditEvents={canEditEvents}
          canCreateRunSheet={canCreateRunSheet}
          onClose={() => setSelected(null)}
          onSchedule={(slotId) => {
            setSelected(null)
            setScheduling({ slotId })
          }}
          onCreateEvent={() => {
            const day = selectedDay.date
            setSelected(null)
            setCreatingEvent(day)
          }}
          // Editing opens the composer on the existing event — the same form that
          // created it, so there is one place to change an event, not two.
          onEditEvent={(eventId) => {
            setSelected(null)
            setEditingEvent(eventId)
          }}
          onCreateRunSheet={(slotId) => {
            setSelected(null)
            setLaunchingSheet(slotId)
          }}
          onCopyRoster={(slotId) => {
            setSelected(null)
            setCopyingTo(slotId)
          }}
          onRespond={(id, status) => run(() => respondToDuty(id, status))}
          onSetRole={(id, role) => run(() => setDutyRole(id, role))}
          onRemove={(id) => run(() => removeDuty(id))}
        />
      )}

      {scheduling && canSchedule && (
        <ScheduleModal
          month={cursor}
          people={schedulablePeople}
          teams={assignableTeams}
          colorFor={colorFor}
          slots={schedulableSlots}
          existingDuties={clashSource}
          canPublish={canPublish}
          onClose={() => setScheduling(null)}
          onDone={(msg) => {
            setScheduling(null)
            settle(msg)
          }}
          onError={toast.error}
        />
      )}

      {creatingEvent && canEditEvents && (
        <EventModal
          initialDate={creatingEvent}
          teams={subTeams}
          colorFor={colorFor}
          onClose={() => setCreatingEvent(null)}
          onDone={(msg) => {
            setCreatingEvent(null)
            settle(msg)
          }}
          onError={toast.error}
        />
      )}

      {editTarget && canEditEvents && (
        <EventModal
          // Remounted per event, so the form's state is that event's and never the
          // last one's — the fields are seeded once, from props.
          key={editTarget.id}
          initialDate={new Date(editTarget.start_time)}
          event={editTarget}
          teams={subTeams}
          colorFor={colorFor}
          canDelete={canDeleteEvents}
          onClose={() => setEditingEvent(null)}
          onDone={(msg) => {
            setEditingEvent(null)
            settle(msg)
          }}
          onError={toast.error}
        />
      )}

      {copyTarget && canSchedule && (
        <CopyRosterModal
          target={copyTarget}
          candidates={copyableSlots}
          teams={subTeams}
          colorFor={colorFor}
          canPublish={canPublish}
          onClose={() => setCopyingTo(null)}
          onDone={(msg) => {
            setCopyingTo(null)
            settle(msg)
          }}
          onError={toast.error}
        />
      )}

      {launchTarget && canCreateRunSheet && (
        <RunSheetLauncher
          slot={{
            id: launchTarget.id,
            label: launchTarget.label,
            slot_date: launchTarget.slot_date,
            event_title: launchTarget.event_title
          }}
          templates={templates}
          onClose={() => setLaunchingSheet(null)}
          onCreated={(runSheetId, existed) => {
            setLaunchingSheet(null)
            // An existing sheet is opened rather than reported as a conflict — the
            // person clicking wanted to get to it either way.
            if (existed) toast.success("That service already had a run sheet — opening it")
            router.push(`/run-sheets/${runSheetId}`)
          }}
          onError={toast.error}
        />
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────── */

function Toggle({
  label,
  checked,
  onChange,
  swatch
}: {
  label: string
  checked: boolean
  onChange: () => void
  swatch: string
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-subtle/60"
    >
      <span
        className={cn(
          "grid size-3.5 shrink-0 place-items-center rounded-[3px] border transition-colors",
          checked ? cn(swatch, "border-transparent") : "border-border-strong"
        )}
      >
        {checked && <Check className="size-2.5 text-black/70" />}
      </span>
      <span
        className={cn(
          "truncate text-[12.5px] transition-colors",
          checked ? "text-foreground" : "text-faint"
        )}
      >
        {label}
      </span>
    </button>
  )
}
