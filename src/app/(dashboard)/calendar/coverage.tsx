"use client"

import { cn } from "@/lib/utils/cn"
import { isFullyStaffed, shortfall, type TeamCoverage } from "@/lib/utils/rostering"
import { TEAM_COLORS, type TeamColor } from "./team-colors"

/**
 * How well a service is staffed, in one line per team.
 *
 * A slot states what it needs; the roster states who turned up to the ask. The gap
 * between the two is the only thing a scheduler is really looking for, so it is
 * rendered as its own readout rather than left to be inferred by counting names.
 *
 * Colour carries the state — met, short, unfilled — because this sits under every slot
 * in a 320px popover and gets scanned, not read. The numbers are there to confirm what
 * the colour already said, not to be the first thing you parse.
 *
 * Declines are shown alongside the count instead of folded into it. One filled and one
 * declined against a need of two is worse than simply being one short: a person was
 * asked and said no, so that place needs a different name rather than any name.
 */

type CoverageState = "met" | "short" | "unfilled" | "extra"

function stateOf(c: TeamCoverage): CoverageState {
  // A team nobody asked for still has rostered people worth seeing — it is not short,
  // it just was not part of the plan.
  if (c.needed === 0) return "extra"
  if (c.filled === 0) return "unfilled"
  return c.filled >= c.needed ? "met" : "short"
}

const TONE: Record<CoverageState, string> = {
  met: "text-[var(--success)]",
  short: "text-[var(--warning)] font-medium",
  unfilled: "text-[var(--danger)] font-medium",
  extra: "text-faint"
}

export function CoverageRow({
  coverage,
  teams,
  colorFor
}: {
  coverage: TeamCoverage[]
  teams: { id: string; name: string; color: string | null }[]
  colorFor: Map<string, TeamColor>
}) {
  const nameFor = new Map(teams.map((t) => [t.id, t.name]))
  /** Team order, so the same team sits in the same place across every slot on the day. */
  const order = new Map(teams.map((t, i) => [t.id, i]))

  // A team with neither a requirement nor a body is not part of this service's story.
  const rows = coverage
    .filter((c) => c.needed > 0 || c.filled > 0 || c.declined > 0)
    .sort((a, b) => (order.get(a.subTeamId) ?? 99) - (order.get(b.subTeamId) ?? 99))

  if (rows.length === 0) return null

  return (
    <ul className="mt-1.5 space-y-0.5">
      {rows.map((c) => {
        const state = stateOf(c)
        const palette = TEAM_COLORS[colorFor.get(c.subTeamId) ?? "blue"]
        const name = nameFor.get(c.subTeamId) ?? "Unknown team"
        return (
          <li key={c.subTeamId} className="flex items-center gap-1.5">
            <span className={cn("size-1.5 shrink-0 rounded-full", palette.dot)} />
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{name}</span>

            {/* Declines sit next to the count rather than inside it, so a hole that was
                made reads differently from one that was never filled. */}
            {c.declined > 0 && (
              <span className="shrink-0 text-[11px] tabular-nums text-[var(--danger)]">
                {c.declined} declined
              </span>
            )}

            <span
              title={
                c.needed === 0
                  ? `${c.filled} rostered, none required`
                  : `${c.confirmed} confirmed of ${c.filled} rostered, ${c.needed} needed`
              }
              className={cn("shrink-0 text-[11px] tabular-nums", TONE[state])}
            >
              {c.needed === 0 ? `${c.filled} · not required` : `${c.filled} of ${c.needed}`}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The same reading, collapsed to a phrase.
 *
 * Used where a whole slot has to be summed up in the space of a caption. "Nobody
 * rostered" outranks a shortfall count only when nothing at all has been asked for —
 * a slot needing three people with none on it is better served by the number.
 */
export function coverageSummary(coverage: TeamCoverage[]): string {
  const filled = coverage.reduce((sum, c) => sum + c.filled, 0)
  const declined = coverage.reduce((sum, c) => sum + c.declined, 0)
  const needed = coverage.reduce((sum, c) => sum + c.needed, 0)

  if (filled === 0 && declined === 0 && needed === 0) return "Nobody rostered"
  if (!isFullyStaffed(coverage)) return `${shortfall(coverage)} still needed`

  // Nothing was asked for, so nothing can be met — say what is true instead.
  return needed === 0 ? `${filled} rostered` : "Fully staffed"
}
