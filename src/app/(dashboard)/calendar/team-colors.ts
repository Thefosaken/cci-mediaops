/**
 * Per-team calendar colours.
 *
 * The calendar overlays every team at once, so each needs a stable identity the way
 * Google gives each account one. Colours are stored on `sub_teams.color` (migration
 * 00018) rather than derived from list position, so a team keeps its colour when
 * another is added or renamed.
 *
 * Deliberately muted: these sit behind text on a dark surface and appear dozens of
 * times in a month view, so saturation is kept low enough to read against rather than
 * compete with the content.
 */

export type TeamColor = "blue" | "violet" | "emerald" | "amber" | "rose" | "cyan" | "orange"

interface Palette {
  /** Chip background + text, used for duty entries. */
  chip: string
  /** Solid dot, used as the colour key in legends and chips. */
  dot: string
}

export const TEAM_COLORS: Record<TeamColor, Palette> = {
  blue: { chip: "bg-blue-500/15 text-blue-200", dot: "bg-blue-400" },
  violet: { chip: "bg-violet-500/15 text-violet-200", dot: "bg-violet-400" },
  emerald: { chip: "bg-emerald-500/15 text-emerald-200", dot: "bg-emerald-400" },
  amber: { chip: "bg-amber-500/15 text-amber-100", dot: "bg-amber-400" },
  rose: { chip: "bg-rose-500/15 text-rose-200", dot: "bg-rose-400" },
  cyan: { chip: "bg-cyan-500/15 text-cyan-200", dot: "bg-cyan-400" },
  orange: { chip: "bg-orange-500/15 text-orange-200", dot: "bg-orange-400" },
}

const ORDER: TeamColor[] = ["blue", "violet", "emerald", "amber", "rose", "cyan", "orange"]

/** Falls back by position when a team predates the colour column. */
export function resolveTeamColor(stored: string | null, index: number): TeamColor {
  if (stored && stored in TEAM_COLORS) return stored as TeamColor
  return ORDER[index % ORDER.length]
}
