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
  startOfWeek,
} from "date-fns"
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { useToast } from "@/lib/toast/toast-context"
import { removeDuty, respondToDuty } from "@/server/actions/duties"
import { resolveTeamColor, TEAM_COLORS, type TeamColor } from "./team-colors"
import { MonthGrid, WeekGrid, type CalendarEntry } from "./calendar-grid"
import { DayPopover } from "./day-popover"
import { ScheduleModal } from "./schedule-modal"

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
 * Three things live here: services (events), duties (who is rostered), and a link
 * through to a day's run sheet when one exists.
 */

interface EventRow {
  id: string
  title: string
  event_type: string
  start_time: string
  end_time: string | null
  status: string
  location: string | null
  event_sub_teams: { sub_team_id: string }[]
}

interface DutyRow {
  id: string
  user_id: string
  sub_team_id: string
  duty_date: string
  event_id: string | null
  role_title: string | null
  call_time: string | null
  status: string
  users: { id: string; full_name: string } | null
  sub_teams: { id: string; name: string; color: string | null } | null
}

interface Props {
  events: EventRow[]
  subTeams: { id: string; name: string; color: string | null }[]
  duties: DutyRow[]
  runSheets: { id: string; title: string; event_id: string | null; sheet_date: string | null }[]
  users: { id: string; full_name: string }[]
  memberships: { user_id: string; sub_team_id: string }[]
  myTeamIds: string[]
  currentUserId: string
  canSchedule: boolean
  seesAllTeams: boolean
}

type View = "month" | "week"

export function CalendarPageClient({
  events,
  subTeams,
  duties,
  runSheets,
  users,
  memberships,
  myTeamIds,
  currentUserId,
  canSchedule,
  seesAllTeams,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  const [view, setView] = useState<View>("month")
  const [cursor, setCursor] = useState(() => new Date())
  // The anchor rect travels with the selection so the popover can position itself.
  const [selected, setSelected] = useState<{ date: Date; anchor: DOMRect } | null>(null)
  const [scheduling, setScheduling] = useState(false)

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

  const entriesByDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>()
    const push = (d: Date, e: CalendarEntry) => {
      const key = d.toDateString()
      map.set(key, [...(map.get(key) ?? []), e])
    }

    if (showEvents && !onlyMine) {
      for (const ev of events) {
        const at = new Date(ev.start_time)
        push(at, {
          id: `event-${ev.id}`,
          kind: "event",
          date: at,
          label: ev.title,
          meta: format(at, "h:mm a"),
          color: null,
        })
      }
    }

    for (const d of duties) {
      if (!visibleTeams.has(d.sub_team_id)) continue
      const mine = d.user_id === currentUserId
      if (onlyMine && !mine) continue

      // Midday avoids any timezone drift pushing a date-only duty onto the wrong day.
      const at = new Date(`${d.duty_date}T12:00:00`)
      push(at, {
        id: `duty-${d.id}`,
        kind: "duty",
        date: at,
        label: d.users?.full_name ?? "Unassigned",
        meta: d.sub_teams?.name,
        color: colorFor.get(d.sub_team_id) ?? null,
        mine,
        dimmed: d.status === "declined",
      })
    }

    return map
  }, [events, duties, visibleTeams, showEvents, onlyMine, currentUserId, colorFor])

  const selectedDay = useMemo(() => {
    if (!selected) return null
    const day = selected.date
    return {
      date: day,
      events: events.filter((e) => isSameDay(new Date(e.start_time), day)),
      duties: duties.filter((d) => isSameDay(new Date(`${d.duty_date}T12:00:00`), day)),
    }
  }, [selected, events, duties])

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
      .filter((u) =>
        seesAllTeams ? true : u.teamIds.some((id) => assignableIds.has(id))
      )
  }, [users, memberships, assignableTeams, seesAllTeams])

  /**
   * Days each person already has, keyed by person and team, so the modal can render
   * them as taken rather than letting you pick a day that would be rejected.
   */
  const existingByUser = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const d of duties) {
      const key = `${d.user_id}:${d.sub_team_id}`
      const set = map.get(key) ?? new Set<string>()
      set.add(d.duty_date)
      map.set(key, set)
    }
    return map
  }, [duties])

  const title =
    view === "month"
      ? format(cursor, "MMMM yyyy")
      : `${format(startOfWeek(cursor), "d MMM")} – ${format(endOfWeek(cursor), "d MMM yyyy")}`

  const step = (dir: -1 | 1) =>
    setCursor((c) => (view === "month" ? addMonths(c, dir) : addWeeks(c, dir)))

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <PageHeader
        title="Calendar"
        description="Services, duties and who is on when"
        icon={<CalendarIcon />}
        actions={
          canSchedule ? (
            <Button size="sm" onClick={() => setScheduling(true)}>
              <Plus className="size-4" /> Schedule people
            </Button>
          ) : undefined
        }
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

        <h2 className="min-w-0 text-[15px] font-semibold tracking-tight text-foreground">
          {title}
        </h2>

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
          runSheetFor={(eventId) =>
            runSheets.find(
              (r) =>
                r.event_id === eventId ||
                (r.sheet_date && isSameDay(new Date(r.sheet_date), selectedDay.date))
            )
          }
          colorFor={colorFor}
          currentUserId={currentUserId}
          canSchedule={canSchedule}
          onClose={() => setSelected(null)}
          onSchedule={() => {
            setSelected(null)
            setScheduling(true)
          }}
          onRespond={(id, status) =>
            startTransition(async () => {
              const r = await respondToDuty(id, status)
              if (r.error) toast.error(r.error)
              else router.refresh()
            })
          }
          onRemove={(id) =>
            startTransition(async () => {
              const r = await removeDuty(id)
              if (r.error) toast.error(r.error)
              else router.refresh()
            })
          }
        />
      )}

      {scheduling && canSchedule && (
        <ScheduleModal
          month={cursor}
          people={schedulablePeople}
          teams={assignableTeams}
          colorFor={colorFor}
          existingByUser={existingByUser}
          onClose={() => setScheduling(false)}
          onDone={(msg) => {
            setScheduling(false)
            toast.success(msg)
            router.refresh()
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
  swatch,
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

