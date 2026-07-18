"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"

import { cn } from "@/lib/utils/cn"
import { planCascade, type TimelineSession } from "@/lib/utils/run-sheet-timeline"

/**
 * Horizontal calendar track for a run sheet.
 *
 * Sessions never overlap — the database guarantees it — so they share one lane, which
 * is what makes this read as a calendar rather than a Gantt chart.
 *
 * Two direct manipulations, both behaving the way a kanban board does: everything moves
 * live, and it snaps. Dragging a session slides it between 5-minute positions while the
 * sessions after it shift in real time to show exactly where they will end up. Dragging
 * the trailing edge stretches the session and pushes the rest along by the same amount.
 * Nothing waits for the drop to reveal its consequences.
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
const SHOW_PEOPLE = 190
const SHOW_TIME = 100
const SHOW_NAME = 44

/**
 * Bars are sized by content: a header block, plus one row per person listed.
 *
 * People stack vertically rather than collapsing to "first name +2". A run sheet is
 * read to find out who is on, so the names are the payload — hiding all but one behind
 * a counter defeats the point of showing any.
 */
const BAR_HEADER = 50
const PERSON_ROW = 21
const PEOPLE_PADDING = 12
/** Beyond this the bar would dominate the lane; the rest go to the peek. */
const MAX_PEOPLE_IN_BAR = 4

const RULER_HEIGHT = 44
const LANE_PADDING = 14
const DRAG_THRESHOLD = 3
const SNAP_MS = 5 * 60_000
/** Hit area for the resize handle on a bar's trailing edge. */
const RESIZE_GRIP = 10
const MIN_DURATION_MS = 5 * 60_000

/** Rows of people a given session will show at this zoom. */
function peopleRows(session: TrackSession, hourPx: number) {
  const width = ((+new Date(session.end_time) - +new Date(session.start_time)) / 3_600_000) * hourPx
  if (width < SHOW_PEOPLE || session.members.length === 0) return 0
  return Math.min(session.members.length, MAX_PEOPLE_IN_BAR)
}

/**
 * The lane sizes to the busiest session, so every bar shares a baseline. A lane with
 * ragged block heights reads as broken, so the tallest requirement wins.
 */
export function laneHeightFor(sessions: TrackSession[], hourPx: number) {
  const maxRows = sessions.reduce((max, s) => Math.max(max, peopleRows(s, hourPx)), 0)
  const peopleBlock = maxRows > 0 ? maxRows * PERSON_ROW + PEOPLE_PADDING : 0
  return BAR_HEADER + peopleBlock + LANE_PADDING * 2
}

/** What the pointer is currently doing to a session. */
type Gesture =
  | { kind: "move"; id: string; deltaMs: number }
  | { kind: "resize"; id: string; deltaMs: number }
  | null

export function TimelineTrack({
  sessions,
  windowStart,
  hourCount,
  hourPx,
  laneHeight,
  canEdit,
  selectedId,
  onSelect,
  onAddAt,
  onAddRange,
  onPeek,
  onMove,
  onResize,
}: {
  sessions: TrackSession[]
  windowStart: Date
  hourCount: number
  hourPx: number
  laneHeight: number

  canEdit: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onAddAt: (at: Date) => void
  onAddRange: (from: Date, to: Date) => void
  onPeek: (session: TrackSession | null, anchor: DOMRect | null) => void
  onMove: (id: string, newStart: string, newEnd: string) => void
  onResize: (id: string, newStart: string, newEnd: string) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => Date.now())
  const [gesture, setGesture] = useState<Gesture>(null)
  const [drawing, setDrawing] = useState<{ fromMs: number; toMs: number } | null>(null)
  const drawRef = useRef<{ fromMs: number } | null>(null)

  const width = hourCount * hourPx
  const startMs = windowStart.getTime()
  const withinWindow = now >= startMs && now <= startMs + hourCount * 3_600_000

  useEffect(() => {
    if (!withinWindow) return
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [withinWindow])

  const xFor = useCallback((ms: number) => ((ms - startMs) / 3_600_000) * hourPx, [startMs, hourPx])

  const timeAtX = (x: number) => {
    const ms = startMs + (x / hourPx) * 3_600_000
    const quarter = 15 * 60_000
    return new Date(Math.round(ms / quarter) * quarter)
  }

  const hours = useMemo(
    () => Array.from({ length: hourCount }, (_, i) => new Date(startMs + i * 3_600_000)),
    [hourCount, startMs]
  )

  /**
   * Where every session sits right now, including the effect of an in-flight gesture.
   *
   * This is the kanban behaviour: the same cascade maths the server will run is run
   * here on every pointer move, so the sessions after the one being dragged slide out
   * of the way live. Dropping simply commits what is already on screen.
   */
  const displaced = useMemo(() => {
    const map = new Map<string, { start: number; end: number }>()
    if (!gesture) return map

    const target = sessions.find((s) => s.id === gesture.id)
    if (!target) return map

    const origStart = +new Date(target.start_time)
    const origEnd = +new Date(target.end_time)

    const nextStart = gesture.kind === "move" ? origStart + gesture.deltaMs : origStart
    const nextEnd =
      gesture.kind === "move"
        ? origEnd + gesture.deltaMs
        : Math.max(origStart + MIN_DURATION_MS, origEnd + gesture.deltaMs)

    map.set(target.id, { start: nextStart, end: nextEnd })

    const timeline: TimelineSession[] = sessions.map((s) => ({
      id: s.id,
      name: s.name,
      start_time: s.start_time,
      end_time: s.end_time,
    }))

    try {
      const plan = planCascade(
        timeline,
        gesture.id,
        new Date(nextStart).toISOString(),
        new Date(nextEnd).toISOString()
      )
      for (const m of plan.moves) {
        map.set(m.id, { start: +new Date(m.toStart), end: +new Date(m.toEnd) })
      }
    } catch {
      // An invalid interval mid-gesture just means no preview for the others.
    }
    return map
  }, [gesture, sessions])

  const commit = (g: Exclude<Gesture, null>) => {
    const target = sessions.find((s) => s.id === g.id)
    if (!target || g.deltaMs === 0) return
    const origStart = +new Date(target.start_time)
    const origEnd = +new Date(target.end_time)

    if (g.kind === "move") {
      onMove(
        g.id,
        new Date(origStart + g.deltaMs).toISOString(),
        new Date(origEnd + g.deltaMs).toISOString()
      )
    } else {
      const end = Math.max(origStart + MIN_DURATION_MS, origEnd + g.deltaMs)
      onResize(g.id, new Date(origStart).toISOString(), new Date(end).toISOString())
    }
  }

  return (
    <div
      className="flex flex-1 flex-col overflow-auto overscroll-x-contain"
      style={{ scrollbarGutter: "stable" }}
    >
      <div
        style={{ width, minWidth: "100%" }}
        className="relative flex min-h-full flex-col select-none"
      >
        {/* ── Ruler ─────────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-20 flex border-b border-border bg-canvas/80 backdrop-blur-md"
          style={{ height: RULER_HEIGHT }}
        >
          {hours.map((h, i) => (
            <div key={i} style={{ width: hourPx }} className="relative shrink-0">
              <span className="absolute left-2.5 top-3 text-[11px] font-medium tabular-nums tracking-wide text-muted">
                {format(h, "h")}
                <span className="ml-0.5 text-[9.5px] uppercase text-faint">{format(h, "a")}</span>
              </span>
              <span className="absolute bottom-0 h-1.5 w-px bg-border" style={{ left: hourPx / 2 }} />
            </div>
          ))}
        </div>

        {/* ── Lane ──────────────────────────────────────────────── */}
        {/* The lane stretches to fill the card. Bars keep their content height at the
            top; the space beneath stays live track, so the whole card is somewhere you
            can draw a session rather than dead area. */}
        <div
          ref={trackRef}
          className={cn("relative flex-1", canEdit && !gesture && "cursor-crosshair")}
          style={{ minHeight: laneHeight }}
          onPointerDown={(e) => {
            if (!canEdit || !trackRef.current) return
            if ((e.target as HTMLElement).closest("[data-session-bar]")) return
            const x = e.clientX - trackRef.current.getBoundingClientRect().left
            drawRef.current = { fromMs: timeAtX(x).getTime() }
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!drawRef.current || !trackRef.current) return
            const x = e.clientX - trackRef.current.getBoundingClientRect().left
            setDrawing({ fromMs: drawRef.current.fromMs, toMs: timeAtX(x).getTime() })
          }}
          onPointerUp={() => {
            const draw = drawRef.current
            const span = drawing
            drawRef.current = null
            setDrawing(null)
            if (!draw) return
            if (!span || Math.abs(span.toMs - span.fromMs) < 60_000) {
              onAddAt(new Date(draw.fromMs))
            } else {
              onAddRange(
                new Date(Math.min(span.fromMs, span.toMs)),
                new Date(Math.max(span.fromMs, span.toMs))
              )
            }
          }}
          onPointerCancel={() => {
            drawRef.current = null
            setDrawing(null)
          }}
        >
          {/* Gridlines */}
          <div className="pointer-events-none absolute inset-0 flex">
            {hours.map((_, i) => (
              <div key={i} style={{ width: hourPx }} className="relative shrink-0">
                <span className="absolute inset-y-0 left-0 w-px bg-border/50" />
                <span className="absolute inset-y-0 w-px bg-border/20" style={{ left: hourPx / 2 }} />
              </div>
            ))}
          </div>

          {/* Span being drawn */}
          {drawing && Math.abs(drawing.toMs - drawing.fromMs) >= 60_000 && (
            <div
              aria-hidden
              className="pointer-events-none absolute flex items-center justify-center rounded-md border border-primary/60 bg-primary/10"
              style={{
                left: Math.round(xFor(Math.min(drawing.fromMs, drawing.toMs))),
                width: Math.max((Math.abs(drawing.toMs - drawing.fromMs) / 3_600_000) * hourPx, 2),
                top: LANE_PADDING,
                height: BAR_HEADER + LANE_PADDING,
              }}
            >
              <span className="whitespace-nowrap px-2 text-[11px] font-medium tabular-nums text-primary">
                {format(Math.min(drawing.fromMs, drawing.toMs), "h:mm")} –{" "}
                {format(Math.max(drawing.fromMs, drawing.toMs), "h:mm a")}
              </span>
            </div>
          )}

          {/* Sessions */}
          {sessions.map((s, i) => {
            const moved = displaced.get(s.id)
            const start = moved?.start ?? +new Date(s.start_time)
            const end = moved?.end ?? +new Date(s.end_time)
            const isTarget = gesture?.id === s.id

            return (
              <SessionBar
                key={s.id}
                session={s}
                left={xFor(start)}
                width={Math.max(((end - start) / 3_600_000) * hourPx, 6)}
                start={start}
                laneHeight={laneHeight}
                end={end}
                hourPx={hourPx}
                index={i}
                now={now}
                canEdit={canEdit}
                selected={selectedId === s.id}
                active={isTarget}
                nudged={Boolean(moved) && !isTarget}
                onSelect={() => onSelect(s.id)}
                onPeek={onPeek}
                onGesture={setGesture}
                onCommit={commit}
              />
            )
          })}

          {/* Now line */}
          {withinWindow && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-danger"
              style={{ left: Math.round(xFor(now)) }}
            >
              <span className="absolute -left-[3.5px] top-0 size-2 rounded-full bg-danger" />
              <span className="absolute -left-[3.5px] top-0 size-2 animate-ping rounded-full bg-danger/60" />
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
  start,
  end,
  laneHeight,
  hourPx,
  index,
  now,
  canEdit,
  selected,
  active,
  nudged,
  onSelect,
  onPeek,
  onGesture,
  onCommit,
}: {
  session: TrackSession
  left: number
  width: number
  start: number
  end: number
  laneHeight: number

  hourPx: number
  index: number
  now: number
  canEdit: boolean
  selected: boolean
  active: boolean
  nudged: boolean
  onSelect: () => void
  onPeek: (s: TrackSession | null, anchor: DOMRect | null) => void
  onGesture: (g: Gesture) => void
  onCommit: (g: Exclude<Gesture, null>) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drag = useRef<{ startX: number; kind: "move" | "resize"; moved: boolean } | null>(null)

  const progress = now <= start ? 0 : now >= end ? 1 : (now - start) / (end - start)
  const running = progress > 0 && progress < 1

  const openPeek = () => {
    if (drag.current) return
    peekTimer.current = setTimeout(() => {
      if (ref.current) onPeek(session, ref.current.getBoundingClientRect())
    }, 140)
  }
  const closePeek = () => {
    if (peekTimer.current) clearTimeout(peekTimer.current)
    onPeek(null, null)
  }

  useEffect(() => {
    return () => {
      if (peekTimer.current) clearTimeout(peekTimer.current)
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canEdit) return
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    // The trailing edge resizes; anywhere else moves.
    const kind = rect.right - e.clientX <= RESIZE_GRIP ? "resize" : "move"
    drag.current = { startX: e.clientX, kind, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    closePeek()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const raw = e.clientX - drag.current.startX
    if (!drag.current.moved && Math.abs(raw) < DRAG_THRESHOLD) return
    drag.current.moved = true
    // Snap while moving, so the bar always sits where it will land.
    const deltaMs = Math.round(((raw / hourPx) * 3_600_000) / SNAP_MS) * SNAP_MS
    onGesture({ kind: drag.current.kind, id: session.id, deltaMs })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return
    const raw = e.clientX - drag.current.startX
    const { kind, moved } = drag.current
    drag.current = null

    if (!moved) {
      onGesture(null)
      return onSelect()
    }
    const deltaMs = Math.round(((raw / hourPx) * 3_600_000) / SNAP_MS) * SNAP_MS
    onCommit({ kind, id: session.id, deltaMs })
    onGesture(null)
  }

  const done = session.status === "completed"
  const skipped = session.status === "skipped"
  const showPeople = width >= SHOW_PEOPLE && session.members.length > 0

  return (
    <div
      ref={ref}
      data-session-bar
      role="button"
      tabIndex={0}
      aria-label={`${session.name}, ${format(start, "h:mm a")} to ${format(end, "h:mm a")}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null
        onGesture(null)
      }}
      onMouseEnter={openPeek}
      onMouseLeave={closePeek}
      onFocus={() => ref.current && onPeek(session, ref.current.getBoundingClientRect())}
      onBlur={closePeek}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
      style={{
        left: Math.round(left),
        width: Math.round(width),
        top: LANE_PADDING,
        // Every bar shares the lane baseline so the row stays level.
        height: laneHeight - LANE_PADDING * 2,
        animationDelay: active || nudged ? undefined : `${Math.min(index * 35, 350)}ms`,
        zIndex: active ? 30 : undefined,
      }}
      className={cn(
        "group absolute flex flex-col overflow-hidden rounded-md",
        !active && !nudged && "animate-[scale-in_var(--duration-medium)_var(--ease-out-expo)_backwards]",
        // The dragged bar tracks the pointer with no easing; the ones it displaces glide,
        // which is what makes the reflow read as deliberate rather than jittery.
        active
          ? "shadow-[var(--shadow-elevation-xl)] transition-none"
          : nudged
            ? "transition-[left,width] duration-200 ease-[var(--ease-out-expo)]"
            : "transition-[transform,box-shadow,background-color] duration-150 ease-[var(--ease-out-quart)] hover:-translate-y-px hover:shadow-[var(--shadow-md)]",
        canEdit && !active && "cursor-grab",
        active && "cursor-grabbing",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2",
        selected
          ? "bg-primary ring-1 ring-primary"
          : "bg-[var(--color-primary-soft)] ring-1 ring-inset ring-primary/25",
        running && !selected && "ring-primary/50",
        done && "opacity-55",
        skipped && "opacity-40"
      )}
    >
      {/* Elapsed fill */}
      {progress > 0 && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-[15000ms] ease-linear",
            selected ? "bg-black/15" : "bg-primary/20"
          )}
          style={{ width: `${progress * 100}%` }}
        />
      )}
      {running && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px bg-primary transition-[left] duration-[15000ms] ease-linear"
          style={{ left: `${progress * 100}%` }}
        />
      )}

      {/* Start-edge rule */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-[3px]",
          selected ? "bg-[var(--color-primary-foreground)]/50" : "bg-primary"
        )}
      />

      {/* Header: name and time */}
      <div className="relative min-w-0 px-2.5 pt-2">
        {width >= SHOW_NAME && (
          <p
            className={cn(
              "truncate text-[13px] font-semibold leading-tight tracking-[-0.01em]",
              skipped && "line-through",
              selected ? "text-[var(--color-primary-foreground)]" : "text-foreground"
            )}
          >
            {session.name}
          </p>
        )}
        {width >= SHOW_TIME && (
          <p
            className={cn(
              "mt-0.5 truncate text-[11px] tabular-nums leading-tight",
              selected ? "text-[var(--color-primary-foreground)]/70" : "text-muted"
            )}
          >
            {format(start, "h:mm")}–{format(end, "h:mm a")}
            {session.cueCount > 0 && ` · ${session.cueCount} cue${session.cueCount > 1 ? "s" : ""}`}
          </p>
        )}
      </div>

      {/* People, below a rule that separates the plan from the crew. Stacked one per
          row — the names are what the sheet is read for. */}
      {showPeople && (
        <div
          className={cn(
            "relative mt-auto space-y-[3px] border-t px-2.5 py-1.5",
            // A primary-tinted rule over the soft primary fill reads as a dark seam,
            // not a divider. Tinting from the foreground lightens it instead, so it
            // separates the two blocks the way it looks like it should.
            selected ? "border-[var(--color-primary-foreground)]/25" : "border-foreground/10"
          )}
        >
          {session.members.slice(0, MAX_PEOPLE_IN_BAR).map((m) => (
            <div key={m.id} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "grid size-[15px] shrink-0 place-items-center rounded-full text-[7.5px] font-semibold",
                  selected
                    ? "bg-[var(--color-primary-foreground)] text-primary"
                    : "bg-primary/25 text-foreground"
                )}
              >
                {initials(m.name)}
              </span>
              <span
                className={cn(
                  "truncate text-[11px] leading-tight",
                  selected ? "text-[var(--color-primary-foreground)]/80" : "text-muted"
                )}
              >
                {m.name}
              </span>
            </div>
          ))}

          {session.members.length > MAX_PEOPLE_IN_BAR && (
            <span className="block pl-[21px] text-[10.5px] text-faint">
              +{session.members.length - MAX_PEOPLE_IN_BAR} more
            </span>
          )}
        </div>
      )}

      {/* Resize grip on the trailing edge. */}
      {canEdit && width >= SHOW_TIME && (
        <span
          aria-hidden
          className="absolute inset-y-0 right-0 flex w-2.5 cursor-ew-resize items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        >
          <span
            className={cn(
              "h-6 w-[3px] rounded-full",
              selected ? "bg-[var(--color-primary-foreground)]/50" : "bg-primary/50"
            )}
          />
        </span>
      )}

      {/* Live readout while dragging or resizing. */}
      {active && (
        <span className="absolute -top-7 left-0 whitespace-nowrap rounded-md bg-[var(--color-canvas-elevated)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground shadow-[var(--shadow-md)]">
          {format(start, "h:mm")} – {format(end, "h:mm a")}
        </span>
      )}
    </div>
  )
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}
