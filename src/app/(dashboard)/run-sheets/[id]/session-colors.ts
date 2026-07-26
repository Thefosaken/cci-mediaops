/**
 * Per-session colours for the run sheet timeline.
 *
 * A run sheet is read at a glance, mid-service, often on a dim stage. Every bar in one
 * tint means the eye has to read text to tell one block from the next; distinct fills
 * mean "we're in the green one, blue is next" works from across a room.
 *
 * Assigned by position in the running order rather than hashed from the session id.
 * Hashing would keep a session's colour through a reorder, but it also lets two
 * neighbours land on the same hue — and neighbours are exactly the pair the colour
 * exists to separate. Cycling by position makes adjacent bars different by
 * construction, which is worth more than colour permanence on a document that is read
 * top-to-bottom in order.
 *
 * Fills are solid. The previous soft-tint treatment reserved opacity for identity,
 * which left nothing to say "this one is done" with — so opacity now means one thing
 * only: time has passed it.
 */

export interface SessionPalette {
  /** Solid background. */
  fill: string
  /** Primary text on the fill. */
  onFill: string
  /** Secondary text — times, cue counts, names. */
  onFillMuted: string
  /** The 3px rule down the leading edge. */
  edge: string
  /** Resting outline. */
  ring: string
  /** Avatar chip for a listed person. */
  avatar: string
  /** Rule between the plan and the crew. */
  divider: string
}

/**
 * Most fills are deep enough to take white text. Amber is not — it is kept because a
 * warm band breaks up a row of cool ones, and it carries its own dark ink rather than
 * being dropped for the convenience of a single text colour.
 */
const ON_DARK = {
  onFill: "text-white",
  onFillMuted: "text-white/75",
  avatar: "bg-white/20 text-white",
  divider: "border-white/20"
} as const

export const SESSION_COLORS: SessionPalette[] = [
  { fill: "bg-blue-600", edge: "bg-blue-300", ring: "ring-blue-400/50", ...ON_DARK },
  { fill: "bg-violet-600", edge: "bg-violet-300", ring: "ring-violet-400/50", ...ON_DARK },
  { fill: "bg-emerald-600", edge: "bg-emerald-300", ring: "ring-emerald-400/50", ...ON_DARK },
  {
    fill: "bg-amber-500",
    edge: "bg-amber-800",
    ring: "ring-amber-400/50",
    onFill: "text-amber-950",
    onFillMuted: "text-amber-950/70",
    avatar: "bg-black/20 text-amber-950",
    divider: "border-black/15"
  },
  { fill: "bg-rose-600", edge: "bg-rose-300", ring: "ring-rose-400/50", ...ON_DARK },
  { fill: "bg-cyan-700", edge: "bg-cyan-300", ring: "ring-cyan-400/50", ...ON_DARK },
  { fill: "bg-orange-600", edge: "bg-orange-300", ring: "ring-orange-400/50", ...ON_DARK },
  { fill: "bg-indigo-600", edge: "bg-indigo-300", ring: "ring-indigo-400/50", ...ON_DARK }
]

/** The palette for a session at this position in the running order. */
export function sessionPalette(index: number): SessionPalette {
  return SESSION_COLORS[((index % SESSION_COLORS.length) + SESSION_COLORS.length) % SESSION_COLORS.length]
}

/**
 * Whether a session is behind us.
 *
 * The clock is the authority, not the status flag. A lead running the desk rarely
 * stops to mark each item complete, so a sheet where only the ticked items dim would
 * still be showing a bright band over something that finished twenty minutes ago.
 * Marking it complete or skipped just says so earlier.
 */
export function isPast(session: { status: string }, endMs: number, now: number): boolean {
  return now >= endMs || session.status === "completed" || session.status === "skipped"
}
