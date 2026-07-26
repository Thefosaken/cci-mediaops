import type { ClashReason } from "@/types"

/**
 * Rostering rules, as pure functions.
 *
 * The database is the authority — migration 00022's `duty_no_double_booking`
 * exclusion constraint is what actually stops two leads committing the same clash
 * concurrently. This module exists so the UI can answer the same question *before*
 * anyone clicks: a date the system will reject should render as inert, not as
 * available-then-error.
 *
 * Both must agree, so the span arithmetic here mirrors the generated `slot_span`
 * column exactly. If one changes, change the other.
 */

/**
 * Services in one day. Mirrors the `slot_order between 1 and 4` check in 00022, and
 * the per-day unique index that makes position 1 mean the same thing to every event
 * sharing a date — which is what lets the clash rule compare positions at all.
 */
export const MAX_SLOTS = 4

/** Half-open span of slot positions a duty occupies within its day. */
export interface SlotSpan {
  from: number
  /** Exclusive. */
  to: number
}

/**
 * An unslotted duty means "all day" and covers every position, which is what makes it
 * block all four slots without a second rule. A slotted duty covers only its own.
 */
export function spanOf(slotNo: number | null): SlotSpan {
  return slotNo === null ? { from: 1, to: MAX_SLOTS + 1 } : { from: slotNo, to: slotNo + 1 }
}

/** Half-open overlap — `[1,2)` and `[2,3)` do not touch. Matches Postgres `&&`. */
export function spansOverlap(a: SlotSpan, b: SlotSpan): boolean {
  return a.from < b.to && b.from < a.to
}

/** The subset of a duty the clash rule cares about. */
export interface DutyLike {
  user_id: string
  duty_date: string
  slot_no: number | null
  sub_teams?: { name: string } | null
  role_title?: string | null
}

/**
 * Why this person cannot take this slot on this day, or null if they can.
 *
 * Deliberately blind to sub-team: the rule is one duty per person per slot *across
 * every team*. Someone on two teams may serve both on the same Sunday, but not inside
 * the same service — they cannot be in two places at once, and that is the whole point.
 */
export function clashFor(
  candidate: { userId: string; dutyDate: string; slotNo: number | null },
  existing: readonly DutyLike[]
): ClashReason | null {
  const want = spanOf(candidate.slotNo)

  for (const d of existing) {
    if (d.user_id !== candidate.userId) continue
    if (d.duty_date !== candidate.dutyDate) continue
    if (!spansOverlap(want, spanOf(d.slot_no))) continue

    const teamName = d.sub_teams?.name ?? "another team"

    // Which way round the collision runs changes what the person should be told, and
    // "they're on all day" needs a different fix from "they're already in this service".
    if (d.slot_no === null) return { kind: "blocked_by_all_day", teamName }
    if (candidate.slotNo === null) return { kind: "all_day", teamName }
    return { kind: "same_slot", teamName, roleTitle: d.role_title ?? null }
  }

  return null
}

/** Sentence for a clash, in the words a lead would use. */
export function describeClash(reason: ClashReason, personName: string): string {
  switch (reason.kind) {
    case "same_slot":
      return reason.roleTitle
        ? `${personName} is already on ${reason.teamName} for this service (${reason.roleTitle})`
        : `${personName} is already on ${reason.teamName} for this service`
    case "blocked_by_all_day":
      return `${personName} is on ${reason.teamName} all day`
    case "all_day":
      return `${personName} already has a service that day on ${reason.teamName}`
  }
}

/* ── Coverage ───────────────────────────────────────────────────────────── */

export interface TeamCoverage {
  subTeamId: string
  needed: number
  /** Rostered, whatever their answer. */
  filled: number
  /** Rostered and accepted. The number that can actually be relied on. */
  confirmed: number
  declined: number
}

/**
 * How well a slot is staffed, per team.
 *
 * Declines are counted separately rather than reducing `filled`, because a declined
 * duty is not the same as an empty one — the row still names someone who needs
 * replacing, and collapsing the two hides the fact that a hole was created rather
 * than never filled.
 */
export function coverageForSlot(
  requirements: readonly { sub_team_id: string; needed_count: number }[],
  duties: readonly { sub_team_id: string; status: string }[]
): TeamCoverage[] {
  const byTeam = new Map<string, TeamCoverage>()

  const ensure = (subTeamId: string) => {
    const found = byTeam.get(subTeamId)
    if (found) return found
    const fresh: TeamCoverage = { subTeamId, needed: 0, filled: 0, confirmed: 0, declined: 0 }
    byTeam.set(subTeamId, fresh)
    return fresh
  }

  for (const r of requirements) ensure(r.sub_team_id).needed = r.needed_count

  // Teams nobody asked for still appear, with needed 0. Someone rostered against a
  // team the slot does not list is worth seeing, not silently dropping.
  for (const d of duties) {
    const row = ensure(d.sub_team_id)
    if (d.status === "declined" || d.status === "swapped_out") row.declined += 1
    else {
      row.filled += 1
      if (d.status === "confirmed") row.confirmed += 1
    }
  }

  return [...byTeam.values()]
}

/** True when every stated requirement is met. Extra bodies never make a slot short. */
export function isFullyStaffed(coverage: readonly TeamCoverage[]): boolean {
  return coverage.every((c) => c.filled >= c.needed)
}

/** Total people still wanted across every team in a slot. */
export function shortfall(coverage: readonly TeamCoverage[]): number {
  return coverage.reduce((sum, c) => sum + Math.max(0, c.needed - c.filled), 0)
}

/* ── Recurrence ─────────────────────────────────────────────────────────── */

export type Frequency = "weekly" | "fortnightly" | "monthly"

/**
 * The dates a repeat rule lands on, first occurrence included.
 *
 * Works in whole days for weekly and fortnightly so a run never drifts off its
 * weekday. Monthly steps the month number and clamps: a series starting on the 31st
 * lands on the 30th in a 30-day month rather than rolling into the next one, which is
 * what "the 31st of every month" has to mean if it is to mean anything.
 */
export function expandRecurrence(start: Date, frequency: Frequency, count: number): Date[] {
  const out: Date[] = []

  for (let i = 0; i < count; i++) {
    const d = new Date(start.getTime())

    if (frequency === "monthly") {
      const targetDay = start.getDate()
      d.setDate(1)
      d.setMonth(start.getMonth() + i)
      const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      d.setDate(Math.min(targetDay, lastOfMonth))
    } else {
      d.setDate(start.getDate() + i * (frequency === "weekly" ? 7 : 14))
    }

    out.push(d)
  }

  return out
}

/** Local-date ISO. `toISOString` would shift the day for anyone behind UTC. */
export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Move a timestamp onto another calendar day, keeping its clock time.
 *
 * How a recurring service keeps its 08:00 start across a daylight-saving boundary:
 * the wall-clock fields are rebuilt on the new date rather than a fixed number of
 * milliseconds being added, so an hour never quietly appears or vanishes.
 */
export function rebaseOntoDate(timestamp: Date, target: Date): Date {
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
    timestamp.getHours(),
    timestamp.getMinutes(),
    timestamp.getSeconds(),
    timestamp.getMilliseconds()
  )
}
