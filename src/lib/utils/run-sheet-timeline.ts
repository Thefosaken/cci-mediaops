/**
 * Run sheet timeline maths: overlap detection and cascade planning.
 *
 * Sessions occupy half-open intervals [start, end) — start inclusive, end exclusive.
 * A session ending 08:30 and one starting 08:30 do not overlap; the boundary belongs to
 * whichever session starts on it. This is why every comparison below is strict (`<`)
 * rather than inclusive.
 *
 * Everything here is pure: no DB, no React. The database enforces the same rule with an
 * exclusion constraint (migration 00013), so these functions are the fast, explainable
 * layer in front of it rather than the only guard.
 */

/** The minimum a session needs for timeline maths. Placed sessions only. */
export interface TimelineSession {
  id: string
  name: string
  start_time: string
  end_time: string
}

export interface SessionMove {
  id: string
  name: string
  fromStart: string
  fromEnd: string
  toStart: string
  toEnd: string
  /** Positive = later. Always > 0 for cascaded moves. */
  shiftMs: number
  /** True when the new start falls on a different calendar day than the old one. */
  crossesMidnight: boolean
}

export interface CascadePlan {
  /** The move the user actually asked for. */
  target: SessionMove
  /** Later sessions displaced by it, in timeline order. Empty when nothing collides. */
  moves: SessionMove[]
  /**
   * Earlier sessions the edit would run into. A forward cascade cannot resolve these,
   * so they are reported instead of silently fixed.
   */
  conflicts: TimelineSession[]
}

const ms = (iso: string) => new Date(iso).getTime()

/** Half-open overlap test: true only when the intervals genuinely intersect. */
export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return ms(aStart) < ms(bEnd) && ms(bStart) < ms(aEnd)
}

export function sortByStart<T extends TimelineSession>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => ms(a.start_time) - ms(b.start_time))
}

/** Compares local calendar days, so "crosses midnight" means what a person means by it. */
function isDifferentDay(a: string, b: string): boolean {
  const x = new Date(a)
  const y = new Date(b)
  return (
    x.getFullYear() !== y.getFullYear() ||
    x.getMonth() !== y.getMonth() ||
    x.getDate() !== y.getDate()
  )
}

/**
 * Whether a move is worth warning about at the midnight boundary — either the session
 * has been pushed onto a later calendar day, or it now straddles midnight when it
 * didn't before.
 *
 * The end is exclusive, so a session finishing exactly at 00:00 occupies none of the
 * next day and is not straddling anything. Comparing the last instant it actually covers
 * (end - 1ms) keeps that case quiet instead of raising a false alarm on every session
 * that happens to end at midnight.
 */
function midnightWarning(
  fromStart: string,
  toStart: string,
  fromEnd: string,
  toEnd: string
): boolean {
  const lastInstant = (end: string) => new Date(ms(end) - 1).toISOString()

  const pushedToNewDay = isDifferentDay(fromStart, toStart)
  const straddlesNow = isDifferentDay(toStart, lastInstant(toEnd))
  const straddledBefore = isDifferentDay(fromStart, lastInstant(fromEnd))

  return pushedToNewDay || (straddlesNow && !straddledBefore)
}

function shift(session: TimelineSession, byMs: number): SessionMove {
  const toStart = new Date(ms(session.start_time) + byMs).toISOString()
  const toEnd = new Date(ms(session.end_time) + byMs).toISOString()
  return {
    id: session.id,
    name: session.name,
    fromStart: session.start_time,
    fromEnd: session.end_time,
    toStart,
    toEnd,
    shiftMs: byMs,
    crossesMidnight: midnightWarning(session.start_time, toStart, session.end_time, toEnd),
  }
}

/**
 * Work out what moving one session to a new interval does to the rest of the sheet.
 *
 * Later sessions are pushed forward just enough to clear the session before them, and
 * the push carries down the chain until a natural gap absorbs it. Durations are always
 * preserved — a cascade moves sessions, it never stretches or shrinks them.
 *
 * Returns a plan; applies nothing. The caller previews it, then commits every move in a
 * single transaction so the DB never sees a half-applied intermediate state (which the
 * exclusion constraint would reject anyway).
 */
export function planCascade(
  sessions: TimelineSession[],
  editId: string,
  newStart: string,
  newEnd: string
): CascadePlan {
  const target = sessions.find((s) => s.id === editId)
  if (!target) {
    throw new Error(`planCascade: session ${editId} is not in the supplied list`)
  }
  if (ms(newEnd) <= ms(newStart)) {
    throw new Error("planCascade: end time must be after start time")
  }

  const others = sortByStart(sessions.filter((s) => s.id !== editId))

  // Sessions that began before the edited one keep their place. If the edit reaches back
  // into one of them, pushing forward cannot help — report it and let the user decide.
  const originalStart = ms(target.start_time)
  const predecessors = others.filter((s) => ms(s.start_time) < originalStart)
  const conflicts = predecessors.filter((s) =>
    overlaps(newStart, newEnd, s.start_time, s.end_time)
  )

  const targetMove: SessionMove = {
    id: target.id,
    name: target.name,
    fromStart: target.start_time,
    fromEnd: target.end_time,
    toStart: newStart,
    toEnd: newEnd,
    shiftMs: ms(newStart) - originalStart,
    crossesMidnight: midnightWarning(target.start_time, newStart, target.end_time, newEnd),
  }

  // Walk forward. `cursor` is the end of the last session we've settled; anything
  // starting before it has to move.
  const successors = others.filter((s) => ms(s.start_time) >= originalStart)
  const moves: SessionMove[] = []
  let cursor = ms(newEnd)

  for (const session of successors) {
    const start = ms(session.start_time)

    if (start >= cursor) {
      // A gap absorbed the shift — nothing beyond this point can be affected, because
      // successors are sorted and this one didn't move.
      break
    }

    const move = shift(session, cursor - start)
    moves.push(move)
    cursor = ms(move.toEnd)
  }

  return { target: targetMove, moves, conflicts }
}

/**
 * Whether a proposed interval fits without disturbing anything — the cheap check for
 * the create-session form, before any cascade preview is needed.
 */
export function findCollisions(
  sessions: TimelineSession[],
  start: string,
  end: string,
  ignoreId?: string
): TimelineSession[] {
  return sessions
    .filter((s) => s.id !== ignoreId)
    .filter((s) => overlaps(start, end, s.start_time, s.end_time))
}

/**
 * Suggest times for the `+` on an hour column: that hour, running one hour, trimmed to
 * stop at the next session if one is already there. Returns null when the hour is full.
 */
export function suggestSlot(
  sessions: TimelineSession[],
  hourStart: string,
  defaultDurationMs = 60 * 60 * 1000
): { start: string; end: string } | null {
  const start = ms(hourStart)
  const later = sortByStart(sessions).filter((s) => ms(s.end_time) > start)

  // Something already covers this instant.
  if (later.some((s) => ms(s.start_time) <= start)) return null

  const nextStart = later.length > 0 ? ms(later[0].start_time) : Infinity
  const end = Math.min(start + defaultDurationMs, nextStart)

  if (end <= start) return null

  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() }
}
