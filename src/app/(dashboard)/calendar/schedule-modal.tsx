"use client"

import { useMemo, useState } from "react"
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from "date-fns"
import { Search, Users } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { assignDutyBulk } from "@/server/actions/duties"
import { TEAM_COLORS, type TeamColor } from "./team-colors"
import { DatePickerGrid } from "./date-picker-grid"

import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Bulk rostering.
 *
 * Person first, because that is how the decision is actually made — you think "who is
 * on this month", not "which team needs filling". Their team follows from the choice
 * rather than being asked for: the system already knows it, and restating it is a step
 * that can only be got wrong.
 *
 * The month grid shows the days that person is already on, so their load is visible
 * while you add to it. Double-booking a day is impossible rather than merely warned
 * about — those days are inert.
 */

/** Stable empty set, so an unpicked person does not churn identity each render. */
const EMPTY: ReadonlySet<string> = new Set<string>()

export interface SchedulablePerson {
  id: string
  full_name: string
  teamIds: string[]
}

export function ScheduleModal({
  month,
  people,
  teams,
  colorFor,
  existingByUser,
  onClose,
  onDone,
  onError,
}: {
  month: Date
  people: SchedulablePerson[]
  teams: { id: string; name: string; color: string | null }[]
  colorFor: Map<string, TeamColor>
  /** ISO dates each user is already rostered, keyed by `${userId}:${teamId}`. */
  existingByUser: Map<string, Set<string>>
  onClose: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const [query, setQuery] = useState("")
  const [personId, setPersonId] = useState<string | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [role, setRole] = useState("")
  const [saving, setSaving] = useState(false)
  /** The picker navigates independently of the calendar behind it. */
  const [viewMonth, setViewMonth] = useState(month)

  const person = people.find((p) => p.id === personId) ?? null
  const personTeams = person ? teams.filter((t) => person.teamIds.includes(t.id)) : []
  /** One team is the common case, so it resolves silently; several needs a choice. */
  const resolvedTeam = teamId ?? (personTeams.length === 1 ? personTeams[0].id : null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? people.filter((p) => p.full_name.toLowerCase().includes(q)) : people
  }, [people, query])

  // Follows the picker, not the calendar behind — a weekday shortcut should act on the
  // month you are looking at.
  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) }),
    [viewMonth]
  )

  // A single map lookup — not worth memoizing, and the compiler can't preserve it.
  const already =
    person && resolvedTeam
      ? (existingByUser.get(`${person.id}:${resolvedTeam}`) ?? EMPTY)
      : EMPTY

  const selectPerson = (id: string) => {
    setPersonId(id)
    setTeamId(null)
    // Days already picked belong to the previous person's rota, not this one.
    setPicked(new Set())
  }

  const toggleDay = (iso: string) => {
    if (already.has(iso)) return
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(iso)) next.delete(iso)
      else next.add(iso)
      return next
    })
  }

  const pickWeekday = (weekday: number) => {
    const matching = days
      .filter((d) => d.getDay() === weekday)
      .map(toIso)
      .filter((d) => !already.has(d))
    if (matching.length === 0) return
    setPicked((prev) => {
      const next = new Set(prev)
      const allOn = matching.every((d) => next.has(d))
      matching.forEach((d) => (allOn ? next.delete(d) : next.add(d)))
      return next
    })
  }

  const submit = async () => {
    if (!person || !resolvedTeam) return
    setSaving(true)
    const res = await assignDutyBulk({
      userId: person.id,
      subTeamId: resolvedTeam,
      dates: [...picked].sort(),
      roleTitle: role.trim() || undefined,
    })
    setSaving(false)
    if (res.error) return onError(res.error)
    onDone(
      res.skipped
        ? `${person.full_name} scheduled for ${res.added} day${res.added === 1 ? "" : "s"} · ${res.skipped} already covered`
        : `${person.full_name} scheduled for ${res.added} day${res.added === 1 ? "" : "s"}`
    )
  }

  const palette = resolvedTeam ? TEAM_COLORS[colorFor.get(resolvedTeam) ?? "blue"] : null

  /**
   * Reads as dates rather than a count: "6, 13, 20 July" is checkable at a glance,
   * "3 days" is not. Collapses to a count once the list would be longer than the line.
   */
  const summary = (() => {
    const sorted = [...picked].sort()
    if (sorted.length === 0) return ""
    if (sorted.length > 6) return `${sorted.length} dates selected`
    const byMonth = new Map<string, string[]>()
    for (const iso of sorted) {
      const d = new Date(`${iso}T12:00:00`)
      const key = format(d, "MMMM")
      byMonth.set(key, [...(byMonth.get(key) ?? []), format(d, "d")])
    }
    return [...byMonth.entries()].map(([m, ds]) => `${ds.join(", ")} ${m}`).join(" · ")
  })()

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
            loading={saving}
            disabled={!person || !resolvedTeam || picked.size === 0}
            onClick={submit}
          >
            Schedule{picked.size > 0 && ` ${picked.size} day${picked.size === 1 ? "" : "s"}`}
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

              <ul className="mt-2 max-h-[188px] space-y-0.5 overflow-y-auto">
                {filtered.length === 0 && (
                  <li className="px-2 py-6 text-center text-[12.5px] text-faint">
                    Nobody matches
                  </li>
                )}
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
            </>
          )}
        </section>

        {/* ── When ────────────────────────────────────────────── */}
        <section className={cn(!person && "pointer-events-none opacity-40")}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            When
          </h3>

          <div className="rounded-md border border-border bg-surface p-3">
            <DatePickerGrid
              month={viewMonth}
              onMonthChange={setViewMonth}
              picked={picked}
              taken={already}
              onToggle={toggleDay}
              onToggleWeekday={pickWeekday}
              accentDot={palette?.dot}
            />
          </div>

          {/* Says what will happen, in the words you'd use out loud. */}
          <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted">
            <Users className="mt-0.5 size-3.5 shrink-0 text-faint" />
            {picked.size === 0 ? (
              already.size > 0 ? (
                <span>
                  Already on {already.size} day{already.size === 1 ? "" : "s"}. Tap dates, or a
                  weekday letter to select the whole column.
                </span>
              ) : (
                <span>Tap dates, or a weekday letter to select the whole column.</span>
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
            Applies to every date selected. You can change it per day afterwards.
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

/** Local-date ISO — toISOString would shift across the date line. */
function toIso(d: Date) {
  return format(d, "yyyy-MM-dd")
}
