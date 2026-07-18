"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import { Plus, GripVertical } from "lucide-react"

import { cn } from "@/lib/utils/cn"

/**
 * Horizontal calendar track for a run sheet.
 *
 * Time runs left to right, as sketched. Sessions never overlap — the database
 * guarantees it — so they share a single lane, which is what makes this read as a
 * calendar rather than a Gantt chart.
 *
 * Three mechanisms keep short sessions legible on a horizontal axis: the zoom control,
 * bars that reveal detail progressively by width and height, and the hover peek that
 * carries whatever a bar is too small to show.
 *
 * A session in progress fills left to right in real time, so the sheet reads as a clock
 * as well as a plan.
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
/** Lane height at which a bar has room for a second detail row. */
const TALL_LANE = 132

const RULER_HEIGHT = 44
const LANE_PADDING = 14
/** Drag less than this and it counts as a click, not a move. */
const DRAG_THRESHOLD = 4
const SNAP_MS = 5 * 60_000

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
  onPeek,
  onMove,
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
  onPeek: (session: TrackSession | null, anchor: DOMRect | null) => void
  onMove: (id: string, newStart: string, newEnd: string) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [ghostX, setGhostX] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [dragging, setDragging] = useState<{ id: string; dx: number } | null>(null)

  const width = hourCount * hourPx
  const startMs = windowStart.getTime()
  const endMs = startMs + hourCount * 3_600_000

  const withinWindow = now >= startMs && now <= endMs

  // Tick often enough that a progress fill moves visibly, rarely enough to stay cheap.
  // The fill itself transitions between ticks, so it reads as continuous.
  useEffect(() => {
    if (!withinWindow) return
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [withinWindow])

  const xFor = useCallback((ms: number) => ((ms - startMs) / 3_600_000) * hourPx, [startMs, hourPx])

  /** Snap a pixel offset to the nearest 15 minutes — the granularity people plan in. */
  const timeAtX = (x: number) => {
    const ms = startMs + (x / hourPx) * 3_600_000
    const quarter = 15 * 60_000
    return new Date(Math.round(ms / quarter) * quarter)
  }

  const hours = useMemo(
    () => Array.from({ length: hourCount }, (_, i) => new Date(startMs + i * 3_600_000)),
    [hourCount, startMs]
  )

  return (
    <div
      className="flex-1 overflow-auto overscroll-x-contain"
      style={{ scrollbarGutter: "stable" }}
    >
      <div style={{ width, minWidth: "100%" }} className="relative select-none">
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
        <div
          ref={trackRef}
          className={cn("relative", canEdit && !dragging && "cursor-copy")}
          style={{ height: laneHeight }}
          onMouseMove={(e) => {
            if (!canEdit || dragging || !trackRef.current) return
            setGhostX(e.clientX - trackRef.current.getBoundingClientRect().left)
          }}
          onMouseLeave={() => setGhostX(null)}
          onClick={(e) => {
            if (!canEdit || dragging || !trackRef.current) return
            if ((e.target as HTMLElement).closest("[data-session-bar]")) return
            onAddAt(timeAtX(e.clientX - trackRef.current.getBoundingClientRect().left))
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

          {/* Ghost slot — click-to-create, shown before the click. */}
          {canEdit && ghostX !== null && !dragging && (
            <div
              aria-hidden
              className="pointer-events-none absolute flex items-center justify-center rounded-xl
                         border border-dashed border-primary/45 bg-primary/[0.05]"
              style={{
                left: Math.round(xFor(timeAtX(ghostX).getTime())),
                width: hourPx / 2,
                top: LANE_PADDING,
                height: laneHeight - LANE_PADDING * 2,
              }}
            >
              <span className="flex items-center gap-1 text-[11px] font-medium text-primary/80">
                <Plus className="size-3.5" />
                {format(timeAtX(ghostX), "h:mm a")}
              </span>
            </div>
          )}

          {/* Sessions */}
          {sessions.map((s, i) => (
            <SessionBar
              key={s.id}
              session={s}
              left={xFor(new Date(s.start_time).getTime())}
              width={Math.max(
                ((new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 3_600_000) * hourPx,
                6
              )}
              laneHeight={laneHeight}
              hourPx={hourPx}
              index={i}
              now={now}
              canEdit={canEdit}
              selected={selectedId === s.id}
              dragDx={dragging?.id === s.id ? dragging.dx : 0}
              onSelect={() => onSelect(s.id)}
              onPeek={onPeek}
              onDragState={setDragging}
              onMove={onMove}
            />
          ))}

          {/* Now line — the single red element on the track. */}
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
  laneHeight,
  hourPx,
  index,
  now,
  canEdit,
  selected,
  dragDx,
  onSelect,
  onPeek,
  onDragState,
  onMove,
}: {
  session: TrackSession
  left: number
  width: number
  laneHeight: number
  hourPx: number
  index: number
  now: number
  canEdit: boolean
  selected: boolean
  dragDx: number
  onSelect: () => void
  onPeek: (s: TrackSession | null, anchor: DOMRect | null) => void
  onDragState: (d: { id: string; dx: number } | null) => void
  onMove: (id: string, newStart: string, newEnd: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drag = useRef<{ startX: number; moved: boolean } | null>(null)

  const start = new Date(session.start_time).getTime()
  const end = new Date(session.end_time).getTime()

  /** 0 before it starts, 1 once it's over — drives the fill. */
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

  /* ── Drag to reschedule ──────────────────────────────────────── */
  const onPointerDown = (e: React.PointerEvent) => {
    if (!canEdit) return
    e.stopPropagation()
    drag.current = { startX: e.clientX, moved: false }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    closePeek()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.startX
    if (!drag.current.moved && Math.abs(dx) < DRAG_THRESHOLD) return
    drag.current.moved = true
    onDragState({ id: session.id, dx })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.startX
    const moved = drag.current.moved
    drag.current = null
    onDragState(null)

    // Below the threshold this was a click, not a drag.
    if (!moved) return onSelect()

    // Convert pixels to time, snapped to 5 minutes, keeping the duration intact.
    const deltaMs = Math.round(((dx / hourPx) * 3_600_000) / SNAP_MS) * SNAP_MS
    if (deltaMs === 0) return
    onMove(
      session.id,
      new Date(start + deltaMs).toISOString(),
      new Date(end + deltaMs).toISOString()
    )
  }

  const done = session.status === "completed"
  const skipped = session.status === "skipped"
  const isDragging = dragDx !== 0
  const tall = laneHeight >= TALL_LANE

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
        onDragState(null)
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
        height: laneHeight - LANE_PADDING * 2,
        transform: isDragging ? `translateX(${dragDx}px)` : undefined,
        animationDelay: `${Math.min(index * 35, 350)}ms`,
        zIndex: isDragging ? 30 : undefined,
      }}
      className={cn(
        "group absolute flex flex-col justify-center overflow-hidden rounded-xl px-3",
        "animate-[scale-in_var(--duration-medium)_var(--ease-out-expo)_backwards]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2",
        isDragging
          ? "cursor-grabbing shadow-[var(--shadow-elevation-xl)] scale-[1.015] transition-none"
          : cn(
              "transition-[transform,box-shadow,background-color] duration-150 ease-[var(--ease-out-quart)]",
              canEdit && "cursor-grab",
              "hover:-translate-y-px hover:shadow-[var(--shadow-md)] active:scale-[0.995]"
            ),
        selected
          ? "bg-primary shadow-[var(--shadow-md)] ring-1 ring-primary"
          : "bg-[var(--color-primary-soft)]",
        running && !selected && "ring-1 ring-primary/40",
        done && "opacity-55",
        skipped && "opacity-40"
      )}
    >
      {/* Elapsed fill. Sits behind the label and grows left to right in real time. */}
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

      {/* Leading edge of the fill — a bright hairline that reads as "now" inside the bar. */}
      {running && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px bg-primary transition-[left] duration-[15000ms] ease-linear"
          style={{ left: `${progress * 100}%` }}
        />
      )}

      {/* Start-edge rule — anchors the bar to the time that matters. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-[3px]",
          selected ? "bg-[var(--color-primary-foreground)]/50" : "bg-primary"
        )}
      />

      {canEdit && width >= SHOW_TIME && (
        <GripVertical
          aria-hidden
          className={cn(
            "absolute right-1 top-1/2 size-3.5 -translate-y-1/2 opacity-0 transition-opacity duration-150",
            "group-hover:opacity-40",
            selected ? "text-[var(--color-primary-foreground)]" : "text-muted"
          )}
        />
      )}

      <div className="relative min-w-0">
        {width >= SHOW_NAME && (
          <p
            className={cn(
              "truncate text-[13px] font-medium leading-tight",
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
              "mt-1 truncate text-[11px] tabular-nums leading-tight",
              selected ? "text-[var(--color-primary-foreground)]/75" : "text-muted"
            )}
          >
            {format(start, "h:mm")}–{format(end, "h:mm a")}
            {session.cueCount > 0 && ` · ${session.cueCount} cue${session.cueCount > 1 ? "s" : ""}`}
          </p>
        )}

        {tall && width >= SHOW_MEMBERS && session.members.length > 0 && (
          <div className="mt-2.5 flex items-center -space-x-1.5">
            {session.members.slice(0, 5).map((m) => (
              <span
                key={m.id}
                title={m.name}
                className={cn(
                  "grid size-6 place-items-center rounded-full text-[9.5px] font-semibold ring-2",
                  selected
                    ? "bg-[var(--color-primary-foreground)] text-primary ring-primary"
                    : "bg-surface text-muted ring-[var(--color-primary-soft)]"
                )}
              >
                {initials(m.name)}
              </span>
            ))}
            {session.members.length > 5 && (
              <span
                className={cn(
                  "pl-3 text-[10px] tabular-nums",
                  selected ? "text-[var(--color-primary-foreground)]/75" : "text-muted"
                )}
              >
                +{session.members.length - 5}
              </span>
            )}
          </div>
        )}
      </div>

      {/* While dragging, show the time it would land on. */}
      {isDragging && (
        <span
          className="absolute -top-7 left-0 rounded-md bg-[var(--color-canvas-elevated)] px-1.5 py-0.5
                     text-[11px] font-medium tabular-nums text-foreground shadow-[var(--shadow-md)]"
        >
          {format(
            new Date(start + Math.round(((dragDx / hourPx) * 3_600_000) / SNAP_MS) * SNAP_MS),
            "h:mm a"
          )}
        </span>
      )}
    </div>
  )
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}
