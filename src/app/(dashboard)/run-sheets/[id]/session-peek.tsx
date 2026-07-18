"use client"

// No React state here — the peek is fully driven by props from the track.
import { createPortal } from "react-dom"
import { format, differenceInMinutes } from "date-fns"

import { cn } from "@/lib/utils/cn"
import type { TrackSession } from "./timeline-track"

/**
 * Hover card for a session.
 *
 * This carries real weight in the horizontal layout: a narrow bar cannot show its own
 * name, so the peek is where that information actually lives. It has to be fast,
 * accurate and impossible to miss.
 *
 * Portalled to the body with fixed positioning, for the same reason Select is
 * (see CLAUDE.md): the track scrolls inside an overflow container that would clip it.
 */

export interface PeekCue {
  subTeam: string
  text: string | null
}

export function SessionPeek({
  session,
  anchor,
  cues,
}: {
  session: TrackSession | null
  anchor: DOMRect | null
  cues: PeekCue[]
}) {
  // No mounted-guard needed: session and anchor are only ever set from a pointer or
  // focus event, so this cannot run during server rendering.
  if (!session || !anchor) return null

  const WIDTH = 280
  const GAP = 10

  // Keep it on screen: prefer centred under the bar, then clamp to the viewport.
  const left = Math.min(
    Math.max(12, anchor.left + anchor.width / 2 - WIDTH / 2),
    window.innerWidth - WIDTH - 12
  )
  // Flip above the bar when there isn't room below.
  const below = anchor.bottom + GAP
  const wantsFlip = below + 260 > window.innerHeight
  const top = wantsFlip ? undefined : below
  const bottom = wantsFlip ? window.innerHeight - anchor.top + GAP : undefined

  const mins = differenceInMinutes(new Date(session.end_time), new Date(session.start_time))
  const filled = cues.filter((c) => c.text && c.text.trim() !== "")

  return createPortal(
    <div
      role="tooltip"
      style={{ left, top, bottom, width: WIDTH }}
      className={cn(
        "pointer-events-none fixed z-[70] rounded-xl border border-border bg-[var(--color-canvas-elevated)] p-3.5",
        "shadow-[var(--shadow-elevation-lg)]",
        "animate-[scale-in_180ms_var(--ease-out-expo)] origin-top"
      )}
    >
      <p className="text-[13px] font-semibold leading-snug text-foreground">{session.name}</p>

      <p className="mt-0.5 text-[11.5px] tabular-nums text-muted">
        {format(new Date(session.start_time), "h:mm a")} –{" "}
        {format(new Date(session.end_time), "h:mm a")}
        <span className="mx-1.5 text-faint">·</span>
        {mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ""}`.trim()}
      </p>

      {filled.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-border-subtle pt-2.5">
          {filled.map((c) => (
            <li key={c.subTeam} className="flex gap-2 text-[11.5px] leading-snug">
              <span className="w-[68px] shrink-0 truncate font-medium text-muted">{c.subTeam}</span>
              <span className="min-w-0 flex-1 text-foreground">{c.text}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Stacked, matching the bar. A run-together list of names is hard to count and
          hard to scan for your own. */}
      {session.members.length > 0 && (
        <ul className="mt-2.5 space-y-1.5 border-t border-border-subtle pt-2.5">
          {session.members.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[8.5px] font-semibold text-foreground">
                {m.name
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")
                  .toUpperCase()}
              </span>
              <span className="truncate text-[11.5px] leading-snug text-foreground">{m.name}</span>
            </li>
          ))}
        </ul>
      )}

      {filled.length === 0 && session.members.length === 0 && (
        <p className="mt-2.5 border-t border-border-subtle pt-2.5 text-[11.5px] italic text-faint">
          No cues or members yet
        </p>
      )}
    </div>,
    document.body
  )
}
