import { describe, it, expect } from "vitest"
import {
  overlaps,
  planCascade,
  findCollisions,
  suggestSlot,
  type TimelineSession,
} from "./run-sheet-timeline"

/** Helper: build a session on 2026-07-19 from local clock times. */
const at = (time: string) => new Date(`2026-07-19T${time}:00`).toISOString()

const session = (id: string, start: string, end: string): TimelineSession => ({
  id,
  name: id,
  start_time: at(start),
  end_time: at(end),
})

/** Reads a move's new start back as a local HH:MM for readable assertions. */
const clock = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

describe("overlaps — half-open intervals", () => {
  it("treats touching edges as no overlap", () => {
    // The whole point of the model: 7:30-8:30 and 8:30-9:30 coexist.
    expect(overlaps(at("07:30"), at("08:30"), at("08:30"), at("09:30"))).toBe(false)
  })

  it("detects a genuine intersection", () => {
    expect(overlaps(at("07:30"), at("08:30"), at("08:00"), at("09:00"))).toBe(true)
  })

  it("detects full containment in both directions", () => {
    expect(overlaps(at("07:00"), at("10:00"), at("08:00"), at("09:00"))).toBe(true)
    expect(overlaps(at("08:00"), at("09:00"), at("07:00"), at("10:00"))).toBe(true)
  })

  it("leaves a gap alone", () => {
    expect(overlaps(at("07:00"), at("08:00"), at("09:00"), at("10:00"))).toBe(false)
  })
})

describe("planCascade", () => {
  const sheet = [
    session("a", "07:30", "08:30"),
    session("b", "08:30", "09:30"),
    session("c", "09:30", "10:30"),
  ]

  it("pushes the whole gapless chain when a session is extended", () => {
    const plan = planCascade(sheet, "a", at("07:30"), at("08:45"))

    expect(plan.moves.map((m) => m.id)).toEqual(["b", "c"])
    expect(clock(plan.moves[0].toStart)).toBe("08:45")
    expect(clock(plan.moves[1].toStart)).toBe("09:45")
    expect(plan.conflicts).toEqual([])
  })

  it("preserves durations rather than stretching sessions", () => {
    const plan = planCascade(sheet, "a", at("07:30"), at("08:45"))

    for (const move of plan.moves) {
      const before = new Date(move.fromEnd).getTime() - new Date(move.fromStart).getTime()
      const after = new Date(move.toEnd).getTime() - new Date(move.toStart).getTime()
      expect(after).toBe(before)
    }
  })

  it("stops the chain when a gap absorbs the shift", () => {
    const withGap = [
      session("a", "07:30", "08:30"),
      session("b", "08:30", "09:30"),
      session("c", "11:00", "12:00"), // 90-minute cushion
    ]
    const plan = planCascade(withGap, "a", at("07:30"), at("08:45"))

    // b moves; c has room and must not be touched.
    expect(plan.moves.map((m) => m.id)).toEqual(["b"])
  })

  it("moves nothing when a session shrinks", () => {
    const plan = planCascade(sheet, "a", at("07:30"), at("08:00"))
    expect(plan.moves).toEqual([])
  })

  it("does not disturb a session that is merely adjacent", () => {
    // Extending a to exactly 08:30 still touches b's start — not an overlap.
    const plan = planCascade(sheet, "a", at("07:30"), at("08:30"))
    expect(plan.moves).toEqual([])
  })

  it("reports earlier sessions it would run into instead of pushing forward", () => {
    // Dragging c back to 08:00-09:00 reaches into both a (07:30-08:30) and b (08:30-09:30).
    const plan = planCascade(sheet, "c", at("08:00"), at("09:00"))

    expect(plan.conflicts.map((s) => s.id)).toEqual(["a", "b"])
  })

  it("flags a push that shoves a session's tail past midnight", () => {
    const lateNight = [
      session("crossover", "23:00", "23:45"),
      session("prayer", "23:45", "23:55"),
    ]
    const plan = planCascade(lateNight, "crossover", at("23:00"), at("23:55"))

    // prayer shifts to 23:55-00:05, so it now straddles midnight when it didn't before.
    expect(plan.moves[0].id).toBe("prayer")
    expect(plan.moves[0].crossesMidnight).toBe(true)
  })

  it("stays quiet for a session that merely ends exactly at midnight", () => {
    // The end is exclusive, so 23:50-00:00 occupies none of the next day.
    const lateNight = [
      session("crossover", "23:00", "23:45"),
      session("prayer", "23:45", "23:55"),
    ]
    const plan = planCascade(lateNight, "crossover", at("23:00"), at("23:50"))

    expect(plan.moves[0].crossesMidnight).toBe(false)
  })

  it("allows a session that itself spans midnight", () => {
    // The 31 December cross-over service.
    const start = new Date("2026-12-31T23:30:00").toISOString()
    const end = new Date("2027-01-01T00:30:00").toISOString()
    const plan = planCascade([{ id: "x", name: "x", start_time: start, end_time: end }], "x", start, end)

    expect(plan.moves).toEqual([])
    expect(plan.conflicts).toEqual([])
  })

  it("rejects an inverted interval", () => {
    expect(() => planCascade(sheet, "a", at("09:00"), at("08:00"))).toThrow(
      /end time must be after start time/i
    )
  })

  it("rejects a zero-length interval", () => {
    expect(() => planCascade(sheet, "a", at("08:00"), at("08:00"))).toThrow()
  })

  it("throws when the edited session is not in the list", () => {
    expect(() => planCascade(sheet, "nope", at("07:00"), at("08:00"))).toThrow(/not in the supplied list/i)
  })

  it("handles an unsorted input list", () => {
    const shuffled = [sheet[2], sheet[0], sheet[1]]
    const plan = planCascade(shuffled, "a", at("07:30"), at("08:45"))
    expect(plan.moves.map((m) => m.id)).toEqual(["b", "c"])
  })
})

describe("findCollisions", () => {
  const sheet = [session("a", "07:30", "08:30"), session("b", "09:00", "10:00")]

  it("finds nothing in a free gap", () => {
    expect(findCollisions(sheet, at("08:30"), at("09:00"))).toEqual([])
  })

  it("finds an overlapping session", () => {
    expect(findCollisions(sheet, at("08:00"), at("09:30")).map((s) => s.id)).toEqual(["a", "b"])
  })

  it("ignores the session being edited", () => {
    expect(findCollisions(sheet, at("07:30"), at("08:30"), "a")).toEqual([])
  })
})

describe("suggestSlot", () => {
  it("offers a full hour when the column is empty", () => {
    const slot = suggestSlot([], at("07:00"))!
    expect(clock(slot.start)).toBe("07:00")
    expect(clock(slot.end)).toBe("08:00")
  })

  it("trims the suggestion to stop at the next session", () => {
    const slot = suggestSlot([session("a", "07:30", "08:30")], at("07:00"))!
    expect(clock(slot.end)).toBe("07:30")
  })

  it("returns null when the hour is already covered", () => {
    expect(suggestSlot([session("a", "06:00", "09:00")], at("07:00"))).toBeNull()
  })
})
