import { describe, expect, it } from "vitest"

import {
  clashFor,
  coverageForSlot,
  expandRecurrence,
  isFullyStaffed,
  MAX_SLOTS,
  rebaseOntoDate,
  shortfall,
  spanOf,
  spansOverlap,
  toIsoDate,
  type DutyLike
} from "./rostering"

/**
 * These mirror the `duty_no_double_booking` exclusion constraint in migration 00022.
 * The UI greys out days the database would reject, so the two must agree exactly —
 * a disagreement shows up as either a rejected click or a dead-looking date that was
 * actually free.
 */

const duty = (over: Partial<DutyLike> = {}): DutyLike => ({
  user_id: "ada",
  duty_date: "2026-08-02",
  slot_no: 1,
  sub_teams: { name: "Projection" },
  role_title: null,
  ...over
})

describe("spanOf", () => {
  it("gives an unslotted duty the whole day", () => {
    expect(spanOf(null)).toEqual({ from: 1, to: 5 })
  })

  it("gives a slotted duty just its own position", () => {
    expect(spanOf(2)).toEqual({ from: 2, to: 3 })
  })
})

describe("spansOverlap", () => {
  it("treats adjacent spans as clear — half-open, like Postgres &&", () => {
    expect(spansOverlap(spanOf(1), spanOf(2))).toBe(false)
  })

  it("catches a slot inside an all-day span", () => {
    expect(spansOverlap(spanOf(null), spanOf(4))).toBe(true)
  })

  it("catches a span against itself", () => {
    expect(spansOverlap(spanOf(3), spanOf(3))).toBe(true)
  })
})

describe("clashFor", () => {
  it("allows the same person on different teams in different slots", () => {
    const existing = [duty({ slot_no: 1, sub_teams: { name: "Projection" } })]
    expect(clashFor({ userId: "ada", dutyDate: "2026-08-02", slotNo: 2 }, existing)).toBeNull()
  })

  it("blocks two teams inside one slot", () => {
    const existing = [duty({ slot_no: 1, sub_teams: { name: "Projection" }, role_title: "Lyrics" })]
    expect(clashFor({ userId: "ada", dutyDate: "2026-08-02", slotNo: 1 }, existing)).toEqual({
      kind: "same_slot",
      teamName: "Projection",
      roleTitle: "Lyrics"
    })
  })

  it("blocks the same team twice in one slot, not just different teams", () => {
    const existing = [duty({ slot_no: 1, sub_teams: { name: "Sound" } })]
    const reason = clashFor({ userId: "ada", dutyDate: "2026-08-02", slotNo: 1 }, existing)
    expect(reason?.kind).toBe("same_slot")
  })

  it("lets an all-day duty block every slot", () => {
    const existing = [duty({ slot_no: null, sub_teams: { name: "Sound" } })]
    for (const slotNo of [1, 2, 3, 4]) {
      expect(clashFor({ userId: "ada", dutyDate: "2026-08-02", slotNo }, existing)).toEqual({
        kind: "blocked_by_all_day",
        teamName: "Sound"
      })
    }
  })

  it("stops a new all-day duty landing on someone who already has a service", () => {
    const existing = [duty({ slot_no: 3, sub_teams: { name: "Camera" } })]
    expect(clashFor({ userId: "ada", dutyDate: "2026-08-02", slotNo: null }, existing)).toEqual({
      kind: "all_day",
      teamName: "Camera"
    })
  })

  it("ignores other people and other days", () => {
    const existing = [
      duty({ user_id: "bola", slot_no: 1 }),
      duty({ duty_date: "2026-08-09", slot_no: 1 })
    ]
    expect(clashFor({ userId: "ada", dutyDate: "2026-08-02", slotNo: 1 }, existing)).toBeNull()
  })

  it("returns null against an empty roster", () => {
    expect(clashFor({ userId: "ada", dutyDate: "2026-08-02", slotNo: 1 }, [])).toBeNull()
  })

  /**
   * Positions are unique per DAY, not per event (migration 00022). This is the case
   * that forced it: a morning service and an evening youth night are separate events,
   * and if each numbered its own services from 1 they would share position 1 — making
   * it impossible to serve both. Scoped to the day they are positions 1 and 2, and
   * this passes.
   */
  it("lets one person serve two different events on the same day", () => {
    const morning = duty({ slot_no: 1, sub_teams: { name: "Projection" } })
    expect(clashFor({ userId: "ada", dutyDate: "2026-08-02", slotNo: 2 }, [morning])).toBeNull()
  })

  it("still blocks two duties that landed on one position", () => {
    const morning = duty({ slot_no: 2, sub_teams: { name: "Sound" } })
    expect(clashFor({ userId: "ada", dutyDate: "2026-08-02", slotNo: 2 }, [morning])?.kind).toBe(
      "same_slot"
    )
  })

  it("covers all four positions with one all-day duty and no more", () => {
    const allDay = duty({ slot_no: null })
    expect(spanOf(null)).toEqual({ from: 1, to: MAX_SLOTS + 1 })
    expect(clashFor({ userId: "ada", dutyDate: "2026-08-02", slotNo: MAX_SLOTS }, [allDay])).not.toBeNull()
  })
})

describe("coverageForSlot", () => {
  const reqs = [
    { sub_team_id: "camera", needed_count: 2 },
    { sub_team_id: "sound", needed_count: 1 }
  ]

  it("counts filled and confirmed separately", () => {
    const rows = coverageForSlot(reqs, [
      { sub_team_id: "camera", status: "confirmed" },
      { sub_team_id: "camera", status: "scheduled" }
    ])
    const camera = rows.find((r) => r.subTeamId === "camera")
    expect(camera).toMatchObject({ needed: 2, filled: 2, confirmed: 1, declined: 0 })
  })

  it("does not let a decline count as cover", () => {
    const rows = coverageForSlot(reqs, [{ sub_team_id: "sound", status: "declined" }])
    const sound = rows.find((r) => r.subTeamId === "sound")
    expect(sound).toMatchObject({ needed: 1, filled: 0, declined: 1 })
    expect(isFullyStaffed(rows)).toBe(false)
  })

  it("surfaces someone rostered against a team the slot never asked for", () => {
    const rows = coverageForSlot(reqs, [{ sub_team_id: "lighting", status: "scheduled" }])
    expect(rows.find((r) => r.subTeamId === "lighting")).toMatchObject({ needed: 0, filled: 1 })
  })

  it("reports an unstaffed requirement rather than omitting it", () => {
    const rows = coverageForSlot(reqs, [])
    expect(rows).toHaveLength(2)
    expect(shortfall(rows)).toBe(3)
  })

  it("does not let a surplus on one team mask a gap on another", () => {
    const rows = coverageForSlot(reqs, [
      { sub_team_id: "camera", status: "confirmed" },
      { sub_team_id: "camera", status: "confirmed" },
      { sub_team_id: "camera", status: "confirmed" }
    ])
    expect(isFullyStaffed(rows)).toBe(false)
    expect(shortfall(rows)).toBe(1)
  })
})

describe("expandRecurrence", () => {
  it("keeps a weekly run on its weekday", () => {
    const dates = expandRecurrence(new Date(2026, 7, 2), "weekly", 4)
    expect(dates.map(toIsoDate)).toEqual([
      "2026-08-02",
      "2026-08-09",
      "2026-08-16",
      "2026-08-23"
    ])
    expect(new Set(dates.map((d) => d.getDay())).size).toBe(1)
  })

  it("steps fortnightly", () => {
    expect(expandRecurrence(new Date(2026, 7, 2), "fortnightly", 3).map(toIsoDate)).toEqual([
      "2026-08-02",
      "2026-08-16",
      "2026-08-30"
    ])
  })

  it("clamps a monthly run rather than rolling into the next month", () => {
    // The 31st of January, repeated monthly — February has no 31st, and a naive
    // setMonth would silently produce 3 March.
    expect(expandRecurrence(new Date(2026, 0, 31), "monthly", 3).map(toIsoDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31"
    ])
  })

  it("does not lose the original day after a clamped month", () => {
    const dates = expandRecurrence(new Date(2026, 0, 31), "monthly", 4)
    expect(toIsoDate(dates[3])).toBe("2026-04-30")
  })

  it("crosses a year boundary", () => {
    expect(expandRecurrence(new Date(2026, 11, 27), "weekly", 2).map(toIsoDate)).toEqual([
      "2026-12-27",
      "2027-01-03"
    ])
  })
})

describe("rebaseOntoDate", () => {
  it("keeps the clock time when moving to another day", () => {
    const moved = rebaseOntoDate(new Date(2026, 7, 2, 8, 30), new Date(2026, 7, 9))
    expect(toIsoDate(moved)).toBe("2026-08-09")
    expect(moved.getHours()).toBe(8)
    expect(moved.getMinutes()).toBe(30)
  })
})

describe("toIsoDate", () => {
  it("uses the local calendar day, not UTC", () => {
    // 23:30 local on the 2nd is already the 3rd in UTC for anyone ahead of it, and
    // the 1st for anyone behind. The roster's day must not move with the reader.
    expect(toIsoDate(new Date(2026, 7, 2, 23, 30))).toBe("2026-08-02")
  })

  it("pads single-digit months and days", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})
