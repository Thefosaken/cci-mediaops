"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import { Plus } from "lucide-react"

import { cn } from "@/lib/utils/cn"

/**
 * Horizontal calendar track for a run sheet.
 *
 * Time runs left to right, as in the original sketch. Sessions never overlap — the
 * database guarantees it — so they all sit on a single lane, which is what makes this
 * read like a calendar rather than a Gantt chart.
 *
 * The hard problem with a horizontal axis is short sessions: at a readable scale a
 * five-minute item is barely a dozen pixels wide, with no room for a label. Three
 * things solve it here:
 *
 *   1. Zoom. The scale is a prop, so a dense sheet can be spread out.
 *   2. Progressive disclosure. A bar shows as much as it has room for — full detail,
 *      then name and time, then name alone, then a bare tick.
 *   3. The hover peek. Anything the bar cannot show, the peek shows in full, so no
 *      information depends on a bar being wide.
 */

export interface TrackSession {
  id: string
  name: string
  start_time: string
  end_time: string
  status: string
  cueCount: number
  members: { id: string; name: string }[]
}

/** Width thresholds, in px, at which a bar can afford to show more. */
const SHOW_MEMBERS = 200
const SHOW_TIME = 104
const SHOW_NAME = 48

const TRACK_HEIGHT = 104
const RULER_HEIGHT = 44

export function TimelineTrack({
  sessions,
  windowStart,
  hourCount,
  hourPx,
  canEdit,
  selectedId,
  onSelect,
  onAddAt,
  onPeek,
}: {
  sessions: TrackSession[]
  windowStart: Date
  hourCount: number
  hourPx: number
  canEdit: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onAddAt: (at: Date) => void
  onPeek: (session: TrackSession | null, anchor: DOMRect | null) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [ghostX, setGhostX] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const width = hourCount * hourPx
  const startMs = windowStart.getTime()

  // The "now" line only ticks while the sheet is actually today — no point re-rendering
  // a timeline for last Sunday every minute.
  const showNow = useMemo(() => {
    const end = startMs + hourCount * 3_600_000
    return now >= startMs && now <= end
  }, [now, startMs, hourCount])

  useEffect(() => {
    if (!showNow) return
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [showNow])

  const xFor = (ms: number) => ((ms - startMs) / 3_600_000) * hourPx

  /** Snap a pixel offset to the nearest 15 minutes — the granularity people think in. */
  const timeAtX = (x: number) => {
    const ms = startMs + (x / hourPx) * 3_600_000
    const quarter = 15 * 60_000
    return new Date(Math.round(ms / quarter) * quarter)
  }

  const hours = Array.from({ length: hourCount }, (_, i) => new Date(startMs + i * 3_600_000))

  return (
    <div className="overflow-x-auto overscroll-x-contain" style={{ scrollbarGutter: "stable" }}>
      <div style={{ width, minWidth: "100%" }} className="relative select-none">
        {/* ── Ruler ─────────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-20 flex border-b border-border bg-canvas/85 backdrop-blur-sm"
          style={{ height: RULER_HEIGHT }}
        >
          {hours.map((h, i) => (
            <div key={i} style={{ width: hourPx }} className="relative shrink-0">
              {/* Hour label sits astride its gridline, the way calendar apps do it. */}
              <span className="absolute left-2 top-2.5 text-[11px] font-medium tabular-nums tracking-wide text-muted">
                {format(h, "h")}
                <span className="ml-0.5 text-[9.5px] uppercase text-faint">{format(h, "a")}</span>
              </span>
              {/* Half-hour tick — a quiet cue for reading position. */}
              <span className="absolute bottom-0 h-1.5 w-px bg-border" style={{ left: hourPx / 2 }} />
            </div>
          ))}
        </div>

        {/* ── Track ─────────────────────────────────────────────── */}
        <div
          ref={trackRef}
          className="relative"
          style={{ height: TRACK_HEIGHT }}
          onMouseMove={(e) => {
            if (!canEdit || !trackRef.current) return
            const rect = trackRef.current.getBoundingClientRect()
            setGhostX(e.clientX - rect.left)
          }}
          onMouseLeave={() => setGhostX(null)}
          onClick={(e) => {
            if (!canEdit || !trackRef.current) return
            // Only the empty track creates; clicks on a bar are handled by the bar.
            if ((e.target as HTMLElement).closest("[data-session-bar]")) return
            const rect = trackRef.current.getBoundingClientRect()
            onAddAt(timeAtX(e.clientX - rect.left))
          }}
        >
          {/* Gridlines */}
          <div className="pointer-events-none absolute inset-0 flex">
            {hours.map((_, i) => (
              <div key={i} style={{ width: hourPx }} className="relative shrink-0">
                <span className="absolute inset-y-0 left-0 w-px bg-border/60" />
                <span
                  className="absolute inset-y-0 w-px bg-border/25"
                  style={{ left: hourPx / 2 }}
                />
              </div>
            ))}
          </div>

          {/* Ghost slot follows the cursor over empty track — Google Calendar's
              click-to-create, made visible before the click. */}
          {canEdit && ghostX !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute rounded-lg border border-dashed border-primary/50 bg-primary/[0.06]
                         flex items-center justify-center transition-opacity duration-150"
              style={{
                left: Math.round(xFor(timeAtX(ghostX).getTime())),
                width: hourPx / 2,
                top: 12,
                height: TRACK_HEIGHT - 24,
              }}
            >
              <Plus className="size-4 text-primary/70" />
            </div>
          )}

          {/* Sessions */}
          {sessions.map((s, i) => {
            const start = new Date(s.start_time).getTime()
            const end = new Date(s.end_time).getTime()
            const left = xFor(start)
            const w = Math.max(((end - start) / 3_600_000) * hourPx, 6)

            return (
              <SessionBar
                key={s.id}
                session={s}
                left={left}
                width={w}
                index={i}
                selected={selectedId === s.id}
                onSelect={() => onSelect(s.id)}
                onPeek={onPeek}
              />
            )
          })}

          {/* Now line — the one red element on the track, as in every calendar app. */}
          {showNow && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-danger"
              style={{ left: Math.round(xFor(now)) }}
            >
              <span className="absolute -left-[3px] -top-[3px] size-[7px] rounded-full bg-danger" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────── */

function SessionBar({
  session,
  left,
  width,
  index,
  selected,
  onSelect,
  onPeek,
}: {
  session: TrackSession
  left: number
  width: number
  index: number
  selected: boolean
  onSelect: () => void
  onPeek: (session: TrackSession | null, anchor: DOMRect | null) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A short delay stops the peek flickering as the cursor crosses the track.
  const openPeek = () => {
    timer.current = setTimeout(() => {
      if (ref.current) onPeek(session, ref.current.getBoundingClientRect())
    }, 140)
  }
  const closePeek = () => {
    if (timer.current) clearTimeout(timer.current)
    onPeek(null, null)
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const done = session.status === "completed"
  const skipped = session.status === "skipped"

  return (
    <button
      ref={ref}
      data-session-bar
      type="button"
      onClick={onSelect}
      onMouseEnter={openPeek}
      onMouseLeave={closePeek}
      onFocus={() => ref.current && onPeek(session, ref.current.getBoundingClientRect())}
      onBlur={closePeek}
      style={{
        left: Math.round(left),
        width: Math.round(width),
        top: 12,
        height: TRACK_HEIGHT - 24,
        // Staggered entrance, capped so a long sheet doesn't crawl in.
        animationDelay: `${Math.min(index * 35, 350)}ms`,
      }}
      className={cn(
        "group absolute flex flex-col justify-center overflow-hidden rounded-lg px-2.5 text-left",
        "animate-[scale-in_var(--duration-medium)_var(--ease-out-expo)_backwards]",
        "transition-[transform,box-shadow,background-color] duration-150 ease-[var(--ease-out-quart)]",
        "hover:-translate-y-px hover:shadow-[var(--shadow-md)] active:translate-y-0 active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-1",
        selected
          ? "bg-primary text-[var(--color-primary-foreground)] shadow-[var(--shadow-md)]"
          : "bg-[var(--color-primary-soft)] hover:bg-[var(--color-primary-soft)]",
        // A left rule anchors the bar to its start time — the edge that carries meaning.
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-lg before:bg-primary",
        done && "opacity-60",
        skipped && "opacity-45 [&_.bar-name]:line-through"
      )}
    >
      {width >= SHOW_NAME && (
        <span
          className={cn(
            "bar-name truncate text-[12.5px] font-medium leading-tight",
            selected ? "text-[var(--color-primary-foreground)]" : "text-foreground"
          )}
        >
          {session.name}
        </span>
      )}

      {width >= SHOW_TIME && (
        <span
          className={cn(
            "mt-0.5 truncate text-[11px] tabular-nums leading-tight",
            selected ? "text-[var(--color-primary-foreground)]/75" : "text-muted"
          )}
        >
          {format(new Date(session.start_time), "h:mm")}–{format(new Date(session.end_time), "h:mm a")}
          {session.cueCount > 0 && ` · ${session.cueCount} cue${session.cueCount > 1 ? "s" : ""}`}
        </span>
      )}

      {width >= SHOW_MEMBERS && session.members.length > 0 && (
        <span className="mt-1.5 flex items-center -space-x-1.5">
          {session.members.slice(0, 4).map((m) => (
            <span
              key={m.id}
              title={m.name}
              className={cn(
                "grid size-5 place-items-center rounded-full text-[9px] font-semibold ring-2",
                selected
                  ? "bg-[var(--color-primary-foreground)] text-primary ring-primary"
                  : "bg-surface text-muted ring-[var(--color-primary-soft)]"
              )}
            >
              {initials(m.name)}
            </span>
          ))}
          {session.members.length > 4 && (
            <span
              className={cn(
                "pl-2.5 text-[10px] tabular-nums",
                selected ? "text-[var(--color-primary-foreground)]/75" : "text-muted"
              )}
            >
              +{session.members.length - 4}
            </span>
          )}
        </span>
      )}
    </button>
  )
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}
