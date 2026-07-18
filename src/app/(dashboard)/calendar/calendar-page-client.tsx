"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
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
  ScrollText,
  Trash2,
  Check,
  X as XIcon,
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { useToast } from "@/lib/toast/toast-context"
import { assignDutyBulk, removeDuty, respondToDuty } from "@/server/actions/duties"
import { resolveTeamColor, TEAM_COLORS, type TeamColor } from "./team-colors"
import { MonthGrid, WeekGrid, type CalendarEntry } from "./calendar-grid"

import { PageHeader } from "@/components/ui/page-header"
import { Button, IconButton } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { SidePanel } from "@/components/ui/side-panel"
import { Select } from "@/components/ui/select"
import { FormField } from "@/components/ui/form-field"
import { Badge } from "@/components/ui/badge"

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
  myTeamIds,
  currentUserId,
  canSchedule,
  seesAllTeams,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const [view, setView] = useState<View>("month")
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState<Date | null>(null)
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
    return {
      date: selected,
      events: events.filter((e) => isSameDay(new Date(e.start_time), selected)),
      duties: duties.filter((d) => isSameDay(new Date(`${d.duty_date}T12:00:00`), selected)),
      entries: entriesByDay.get(selected.toDateString()) ?? [],
    }
  }, [selected, events, duties, entriesByDay])

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
              selected={selected}
              onSelectDay={setSelected}
            />
          ) : (
            <WeekGrid
              days={days}
              entriesByDay={entriesByDay}
              selected={selected}
              onSelectDay={setSelected}
            />
          )}
        </div>
      </div>

      {/* ── Day detail ────────────────────────────────────────── */}
      {selectedDay && (
        <SidePanel
          open
          onClose={() => setSelected(null)}
          title={format(selectedDay.date, "EEEE d MMMM")}
          headerSlot={
            <span className="text-[12px] text-muted">
              {selectedDay.entries.length} item{selectedDay.entries.length === 1 ? "" : "s"}
            </span>
          }
        >
          <div className="divide-y divide-border-subtle">
            <section className="p-5">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Services
              </h3>
              {selectedDay.events.length === 0 ? (
                <p className="text-[12.5px] text-faint">Nothing scheduled</p>
              ) : (
                <ul className="space-y-2">
                  {selectedDay.events.map((ev) => {
                    const sheet = runSheets.find(
                      (r) =>
                        r.event_id === ev.id ||
                        (r.sheet_date && isSameDay(new Date(r.sheet_date), selectedDay.date))
                    )
                    return (
                      <li key={ev.id} className="rounded-md border border-border bg-surface p-3">
                        <p className="text-[13px] font-medium text-foreground">{ev.title}</p>
                        <p className="mt-0.5 text-[11.5px] tabular-nums text-muted">
                          {format(new Date(ev.start_time), "h:mm a")}
                          {ev.location && ` · ${ev.location}`}
                        </p>
                        {sheet && (
                          <Link
                            href={`/run-sheets/${sheet.id}`}
                            className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
                          >
                            <ScrollText className="size-3.5" />
                            Open run sheet
                          </Link>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section className="p-5">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                On duty
              </h3>
              {selectedDay.duties.length === 0 ? (
                <p className="text-[12.5px] text-faint">Nobody rostered yet</p>
              ) : (
                <ul className="space-y-1.5">
                  {selectedDay.duties.map((d) => {
                    const mine = d.user_id === currentUserId
                    const palette = TEAM_COLORS[colorFor.get(d.sub_team_id) ?? "blue"]
                    return (
                      <li
                        key={d.id}
                        className="group flex items-center gap-2.5 rounded-md border border-border bg-surface px-2.5 py-2"
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", palette.dot)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-foreground">
                            {d.users?.full_name ?? "Unassigned"}
                          </span>
                          <span className="block truncate text-[11px] text-muted">
                            {d.sub_teams?.name}
                            {d.role_title && ` · ${d.role_title}`}
                          </span>
                        </span>

                        {d.status !== "scheduled" && (
                          <Badge variant={d.status === "declined" ? "danger" : "neutral"}>
                            {d.status}
                          </Badge>
                        )}

                        {/* Responding to your own duty needs no scheduling permission. */}
                        {mine && d.status === "scheduled" && (
                          <span className="flex gap-1">
                            <IconButton
                              label="Accept"
                              size="xs"
                              variant="ghost"
                              onClick={() =>
                                startTransition(async () => {
                                  const r = await respondToDuty(d.id, "confirmed")
                                  if (r.error) toast.error(r.error)
                                  else router.refresh()
                                })
                              }
                            >
                              <Check className="size-3.5" />
                            </IconButton>
                            <IconButton
                              label="Decline"
                              size="xs"
                              variant="ghost"
                              onClick={() =>
                                startTransition(async () => {
                                  const r = await respondToDuty(d.id, "declined")
                                  if (r.error) toast.error(r.error)
                                  else router.refresh()
                                })
                              }
                            >
                              <XIcon className="size-3.5" />
                            </IconButton>
                          </span>
                        )}

                        {canSchedule && (
                          <IconButton
                            label="Remove"
                            size="xs"
                            variant="ghost"
                            className="opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() =>
                              startTransition(async () => {
                                const r = await removeDuty(d.id)
                                if (r.error) toast.error(r.error)
                                else router.refresh()
                              })
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </IconButton>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              {canSchedule && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => setScheduling(true)}
                >
                  <Plus className="size-3.5" /> Schedule someone
                </Button>
              )}
            </section>
          </div>
        </SidePanel>
      )}

      {scheduling && canSchedule && (
        <ScheduleModal
          month={cursor}
          subTeams={seesAllTeams ? subTeams : subTeams.filter((t) => myTeamIds.includes(t.id))}
          users={users}
          colorFor={colorFor}
          busy={pending}
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

/* ────────────────────────────────────────────────────────────────── */

/**
 * Bulk rostering — the monthly-schedule case.
 *
 * Pick a person, a team and the days. The weekday shortcuts cover the common shape
 * ("every Sunday in August") without real recurrence rules, which would be a much
 * larger commitment for a pattern that gets hand-adjusted every month anyway.
 */
function ScheduleModal({
  month,
  subTeams,
  users,
  colorFor,
  busy,
  onClose,
  onDone,
  onError,
}: {
  month: Date
  subTeams: { id: string; name: string; color: string | null }[]
  users: { id: string; full_name: string }[]
  colorFor: Map<string, TeamColor>
  busy: boolean
  onClose: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const [userId, setUserId] = useState("")
  const [subTeamId, setSubTeamId] = useState(subTeams[0]?.id ?? "")
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }),
    [month]
  )

  const toggleDay = (iso: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(iso)) next.delete(iso)
      else next.add(iso)
      return next
    })

  /** Toggles every instance of a weekday — on unless they are all already on. */
  const pickWeekday = (weekday: number) => {
    const matching = days.filter((d) => d.getDay() === weekday).map(toIso)
    setPicked((prev) => {
      const next = new Set(prev)
      const allOn = matching.every((d) => next.has(d))
      matching.forEach((d) => (allOn ? next.delete(d) : next.add(d)))
      return next
    })
  }

  const submit = async () => {
    setSaving(true)
    const res = await assignDutyBulk({ userId, subTeamId, dates: [...picked].sort() })
    setSaving(false)
    if (res.error) return onError(res.error)
    onDone(
      res.skipped
        ? `Scheduled ${res.added} day${res.added === 1 ? "" : "s"} · ${res.skipped} already covered`
        : `Scheduled ${res.added} day${res.added === 1 ? "" : "s"}`
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule people"
      description={format(month, "MMMM yyyy")}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving || busy}
            disabled={!userId || !subTeamId || picked.size === 0}
            onClick={submit}
          >
            Schedule{picked.size > 0 && ` ${picked.size} day${picked.size === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Person" required>
            <Select
              value={userId}
              onChange={setUserId}
              searchable
              placeholder="Choose someone…"
              options={users.map((u) => ({ value: u.id, label: u.full_name }))}
            />
          </FormField>
          <FormField label="Team" required>
            <Select
              value={subTeamId}
              onChange={setSubTeamId}
              options={subTeams.map((t) => ({ value: t.id, label: t.name }))}
            />
          </FormField>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-muted">Days</span>
            <div className="flex gap-1">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickWeekday(i)}
                  className="grid size-6 place-items-center rounded text-[11px] font-medium text-muted transition-colors hover:bg-surface-subtle hover:text-foreground"
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {/* Lead-in blanks so the 1st lands under its real weekday. */}
            {Array.from({ length: startOfMonth(month).getDay() }).map((_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {days.map((d) => {
              const iso = toIso(d)
              const on = picked.has(iso)
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => toggleDay(iso)}
                  className={cn(
                    "grid h-9 place-items-center rounded-md border text-[12.5px] tabular-nums transition-colors duration-100",
                    on
                      ? "border-primary bg-primary font-medium text-[var(--color-primary-foreground)]"
                      : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground"
                  )}
                >
                  {format(d, "d")}
                </button>
              )
            })}
          </div>

          <p className="mt-2 text-[11.5px] text-faint">
            Tap a weekday letter to select every one of them this month.
          </p>
        </div>

        {subTeamId && (
          <p className="flex items-center gap-2 border-t border-border-subtle pt-3 text-[12px] text-muted">
            <span
              className={cn("size-2 rounded-full", TEAM_COLORS[colorFor.get(subTeamId) ?? "blue"].dot)}
            />
            Shows on the calendar in this colour
          </p>
        )}
      </div>
    </Modal>
  )
}

/** Local-date ISO (yyyy-MM-dd) — toISOString would shift across the date line. */
function toIso(d: Date) {
  return format(d, "yyyy-MM-dd")
}
