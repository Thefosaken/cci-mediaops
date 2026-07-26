"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { format } from "date-fns"
import {
  CalendarPlus,
  Check,
  Copy,
  MapPin,
  Pencil,
  Plus,
  ScrollText,
  Trash2,
  X as XIcon
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { coverageForSlot, isFullyStaffed, shortfall } from "@/lib/utils/rostering"
import { TEAM_COLORS, type TeamColor } from "./team-colors"
import { CoverageRow, coverageSummary } from "./coverage"

import { Button, IconButton } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

/**
 * Day detail, anchored to the cell you clicked.
 *
 * A popover rather than a side panel: the content is short, it belongs to a specific
 * square on the grid, and keeping the month visible behind it means you don't lose
 * your place. This is the shape Google uses for the same job.
 *
 * Portalled and fixed-position because the grid scrolls inside an overflow container
 * that would otherwise clip it — the same reason Select portals (see CLAUDE.md). It is
 * placed after it has been measured rather than against a guessed height, so a day
 * holding four services never opens with its last one below the fold of the screen.
 *
 * The day is told in three levels: the event, the services inside it, and the people
 * inside each service. That nesting exists because a Sunday is not one roster but two
 * or three, and a name is only meaningful once you know which service it belongs to.
 * Everything stays inside 344px, so each level buys its indentation with information
 * rather than with chrome.
 */

const WIDTH = 344
const GAP = 8
const EDGE = 12

export interface PopoverSlot {
  id: string
  label: string
  slot_order: number
  start_time: string
  requirements: { sub_team_id: string; needed_count: number }[]
}

export interface PopoverEvent {
  id: string
  title: string
  start_time: string
  location: string | null
  status: string
  slots: PopoverSlot[]
}

export interface PopoverDuty {
  id: string
  user_id: string
  sub_team_id: string
  slot_id: string | null
  role_title: string | null
  status: string
  publish_state: string
  users: { id: string; full_name: string } | null
  sub_teams: { id: string; name: string; color: string | null } | null
}

export function DayPopover({
  date,
  anchor,
  events,
  duties,
  teams,
  runSheetFor,
  colorFor,
  currentUserId,
  canSchedule,
  canEditEvents,
  canCreateRunSheet,
  onClose,
  onSchedule,
  onCreateEvent,
  onEditEvent,
  onCreateRunSheet,
  onCopyRoster,
  onRespond,
  onRemove,
  onSetRole
}: {
  date: Date
  anchor: DOMRect
  events: PopoverEvent[]
  duties: PopoverDuty[]
  teams: { id: string; name: string; color: string | null }[]
  /** The sheet for a slot, if one has been started. */
  runSheetFor: (slotId: string) => { id: string; title: string } | undefined
  colorFor: Map<string, TeamColor>
  currentUserId: string
  canSchedule: boolean
  canEditEvents: boolean
  canCreateRunSheet: boolean
  onClose: () => void
  /** Slot-scoped when a service was clicked, undefined for the whole day. */
  onSchedule: (slotId?: string) => void
  onCreateEvent: () => void
  onEditEvent: (eventId: string) => void
  onCreateRunSheet: (slotId: string) => void
  onCopyRoster: (targetSlotId: string) => void
  onRespond: (dutyId: string, status: "confirmed" | "declined") => void
  onRemove: (dutyId: string) => void
  onSetRole: (dutyId: string, role: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState<{
    left: number
    top: number
    maxHeight: number
    fromLeft: boolean
  } | null>(null)

  // Dismiss on outside click or Escape, the way a popover is expected to behave.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener("keydown", onKey)
    // Deferred so the click that opened it doesn't immediately close it.
    const t = setTimeout(() => window.addEventListener("mousedown", onDown), 0)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("mousedown", onDown)
      clearTimeout(t)
    }
  }, [onClose])

  /**
   * Placed against its own measured height, not an assumed one.
   *
   * The previous version clamped the top against a fixed 380px, which put a tall day
   * off the bottom of a short window and a short day needlessly high on a tall one.
   */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const place = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const maxHeight = vh - EDGE * 2
      const height = Math.min(el.offsetHeight || 420, maxHeight)

      const fromLeft = vw - anchor.right > WIDTH + GAP
      const left = fromLeft
        ? anchor.right + GAP
        : Math.max(EDGE, Math.min(anchor.left - WIDTH - GAP, vw - WIDTH - EDGE))

      // Prefers to line up with the top of the cell, then slides up only as far as
      // it must to fit — so the popover stays visually attached to what you clicked.
      const top = Math.max(EDGE, Math.min(anchor.top - 4, vh - height - EDGE))

      setPlaced({ left, top, maxHeight, fromLeft })
    }

    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [anchor, events, duties])

  const unslotted = duties.filter((d) => d.slot_id === null)

  /**
   * A duty points at a service or at nothing, never at an event — so when the day holds
   * a single event that declares no services, the unslotted duties can only be that
   * event's roster, and they are shown under it with no block of their own. Inventing a
   * "Main" service to hang them from would put a name on the calendar that nobody typed.
   * Any other shape (several events, or slots in play) leaves them genuinely day-wide,
   * and they get the "All day" block instead.
   */
  const soleSlotless = events.length === 1 && events[0].slots.length === 0
  const showAllDay = unslotted.length > 0 && !soleSlotless
  const dayIsEmpty = events.length === 0 && duties.length === 0

  const serviceCount = events.reduce((sum, e) => sum + e.slots.length, 0)
  const peopleCount = new Set(duties.filter((d) => d.status !== "declined").map((d) => d.user_id)).size

  /**
   * One person, one line.
   *
   * A local function rather than a component: it closes over the callbacks and the
   * viewer's identity, which would otherwise be threaded through three call sites
   * unchanged, and the row's behaviour is identical wherever it appears.
   */
  const renderDuty = (d: PopoverDuty) => {
    const mine = d.user_id === currentUserId
    const draft = d.publish_state === "draft"
    const palette = TEAM_COLORS[colorFor.get(d.sub_team_id) ?? "blue"]
    return (
      <li
        key={d.id}
        className={cn(
          "group -mx-1 flex items-center gap-2 rounded-md px-1 py-1",
          "transition-colors duration-100 hover:bg-[var(--surface-hover)]",
          mine && "bg-[var(--surface-hover)]/50"
        )}
      >
        <span className={cn("size-2 shrink-0 rounded-full", palette.dot)} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[12.5px]",
              d.status === "declined" ? "text-faint line-through" : "text-foreground"
            )}
          >
            {d.users?.full_name ?? "Unassigned"}
            {mine && <span className="ml-1 text-[10.5px] text-faint">you</span>}
          </span>

          {/* The role is set here rather than only at scheduling time —
              you usually know who is on long before what they'll be doing. */}
          {canSchedule ? (
            <input
              defaultValue={d.role_title ?? ""}
              placeholder="Add a role…"
              onBlur={(e) => {
                if (e.target.value !== (d.role_title ?? "")) {
                  onSetRole(d.id, e.target.value)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur()
                if (e.key === "Escape") {
                  e.currentTarget.value = d.role_title ?? ""
                  e.currentTarget.blur()
                }
              }}
              className="mt-0.5 w-full truncate rounded-[3px] bg-transparent text-[11px] text-muted outline-none
                         transition-colors placeholder:text-faint hover:bg-[var(--surface-subtle)]
                         focus:bg-[var(--surface-subtle)] focus:text-foreground"
            />
          ) : (
            <span className="block truncate text-[11px] text-muted">
              {d.sub_teams?.name}
              {d.role_title && ` · ${d.role_title}`}
            </span>
          )}
        </span>

        {/* A draft is the scheduler's thinking, not yet an ask. It is marked so the
            plan can be read honestly, and it carries no accept/decline: nobody should
            be answering a question they have not been sent. */}
        {draft && (
          <Badge variant="muted" size="sm">
            draft
          </Badge>
        )}
        {d.status === "confirmed" && (
          <Check className="size-3.5 shrink-0 text-[var(--success)]" />
        )}
        {d.status === "declined" && <Badge variant="danger">declined</Badge>}

        {mine && d.status === "scheduled" && !draft && (
          <span className="flex shrink-0 gap-0.5">
            <IconButton
              label="Accept"
              size="xs"
              variant="ghost"
              onClick={() => onRespond(d.id, "confirmed")}
            >
              <Check className="size-3.5" />
            </IconButton>
            <IconButton
              label="Decline"
              size="xs"
              variant="ghost"
              onClick={() => onRespond(d.id, "declined")}
            >
              <XIcon className="size-3.5" />
            </IconButton>
          </span>
        )}

        {canSchedule && !mine && (
          <IconButton
            label="Remove"
            size="xs"
            variant="ghost"
            className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            onClick={() => onRemove(d.id)}
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        )}
      </li>
    )
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={format(date, "EEEE d MMMM")}
      style={{
        left: placed?.left ?? -9999,
        top: placed?.top ?? 0,
        width: WIDTH,
        maxHeight: placed?.maxHeight,
        transformOrigin: placed?.fromLeft ? "left top" : "right top"
      }}
      className={cn(
        "fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-border",
        "bg-[var(--color-canvas-elevated)] shadow-[var(--shadow-elevation-lg)]",
        placed ? "animate-[scale-in_160ms_var(--ease-out-expo)] opacity-100" : "opacity-0"
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-faint">
            {format(date, "EEEE")}
          </p>
          <p className="text-[17px] font-semibold leading-tight tracking-tight text-foreground">
            {format(date, "d MMMM")}
          </p>
          {/* What the day amounts to, before anyone reads a single name. */}
          {!dayIsEmpty && (
            <p className="mt-1 truncate text-[11px] text-muted">
              {[
                serviceCount > 0 && `${serviceCount} service${serviceCount === 1 ? "" : "s"}`,
                events.length > 0 &&
                  serviceCount === 0 &&
                  `${events.length} event${events.length === 1 ? "" : "s"}`,
                peopleCount > 0 && `${peopleCount} on`
              ]
                .filter(Boolean)
                .join(" · ") || "Nobody rostered yet"}
            </p>
          )}
        </div>
        <IconButton label="Close" size="xs" variant="ghost" onClick={onClose}>
          <XIcon className="size-3.5" />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* An empty day is the one place the calendar can offer the thing it is for.
            Without the right to create events it stays a plain statement of fact. */}
        {dayIsEmpty && (
          <section className="px-4 py-7 text-center">
            <span
              aria-hidden="true"
              className="mx-auto mb-2.5 grid size-9 place-items-center rounded-full border border-dashed border-border text-faint"
            >
              <CalendarPlus className="size-4" />
            </span>
            <p className="text-[12.5px] text-faint">Nothing on this day</p>
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {canEditEvents && (
                <Button size="xs" variant="secondary" onClick={onCreateEvent}>
                  <CalendarPlus className="size-3.5" /> Create event
                </Button>
              )}
              {canSchedule && (
                <Button size="xs" variant="ghost" onClick={() => onSchedule()}>
                  <Plus className="size-3.5" /> Schedule someone
                </Button>
              )}
            </div>
          </section>
        )}

        {events.length > 0 && (
          <section className="space-y-3 px-4 py-3">
            {events.map((ev) => {
              const cancelled = ev.status === "cancelled"
              return (
                <article key={ev.id}>
                  <div className="group flex items-start justify-between gap-1.5">
                    <div className="min-w-0">
                      <h3
                        className={cn(
                          "truncate text-[13.5px] font-semibold tracking-tight",
                          cancelled ? "text-faint line-through" : "text-foreground"
                        )}
                      >
                        {ev.title}
                      </h3>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-muted">
                        <span className="tabular-nums">
                          {format(new Date(ev.start_time), "h:mm a")}
                        </span>
                        {ev.location && (
                          <>
                            <span className="text-faint" aria-hidden="true">·</span>
                            <MapPin className="size-3 shrink-0 text-faint" aria-hidden="true" />
                            <span className="truncate">{ev.location}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1">
                      {/* Cancelled events stay on the grid rather than vanishing —
                          people plan around them, and a silent disappearance reads
                          as a bug rather than as a decision. */}
                      {cancelled && (
                        <Badge variant="danger" size="sm">
                          cancelled
                        </Badge>
                      )}
                      {canEditEvents && (
                        <IconButton
                          label="Edit event"
                          size="xs"
                          variant="ghost"
                          onClick={() => onEditEvent(ev.id)}
                        >
                          <Pencil className="size-3.5" />
                        </IconButton>
                      )}
                    </span>
                  </div>

                  {/* The lone slotless event's roster, with no service chrome above it. */}
                  {ev.slots.length === 0 && soleSlotless && (
                    <div className="mt-1.5">
                      {unslotted.length === 0 ? (
                        <p className="text-[12px] text-faint">Nobody rostered</p>
                      ) : (
                        <ul className="space-y-0.5">{unslotted.map(renderDuty)}</ul>
                      )}
                    </div>
                  )}

                  {ev.slots.map((slot) => {
                    const slotDuties = duties.filter((d) => d.slot_id === slot.id)
                    const coverage = coverageForSlot(slot.requirements, slotDuties)
                    const sheet = runSheetFor(slot.id)
                    const missing = shortfall(coverage)
                    const asked = coverage.reduce((sum, c) => sum + c.needed, 0)
                    const tone =
                      asked === 0
                        ? "neutral"
                        : isFullyStaffed(coverage)
                          ? "met"
                          : missing === asked
                            ? "empty"
                            : "short"

                    return (
                      <section
                        key={slot.id}
                        className="mt-2 rounded-lg border border-border-subtle bg-[var(--surface-subtle)] px-2.5 py-2
                                   transition-colors duration-150 hover:border-border"
                      >
                        <div className="flex items-center gap-1.5">
                          {/* The order marker, not the label, is what tells you which
                              service this is when two are called the same thing. */}
                          <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-[var(--color-canvas-elevated)] text-[10.5px] font-semibold tabular-nums text-muted">
                            {slot.slot_order}
                          </span>
                          <h4 className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                            {slot.label}
                          </h4>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted">
                            {format(new Date(slot.start_time), "h:mm a")}
                          </span>
                        </div>

                        {/* The shortfall, as a state rather than a sentence buried in
                            grey. It is the one thing a scheduler opened this to find. */}
                        <p
                          className={cn(
                            "mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium",
                            tone === "met" && "bg-[var(--success)]/12 text-[var(--success)]",
                            tone === "short" && "bg-[var(--warning)]/12 text-[var(--warning)]",
                            tone === "empty" && "bg-[var(--danger)]/12 text-[var(--danger)]",
                            tone === "neutral" && "bg-surface text-faint"
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "size-1.5 rounded-full",
                              tone === "met" && "bg-[var(--success)]",
                              tone === "short" && "bg-[var(--warning)]",
                              tone === "empty" && "bg-[var(--danger)]",
                              tone === "neutral" && "bg-faint"
                            )}
                          />
                          {coverageSummary(coverage)}
                        </p>

                        {slotDuties.length > 0 && (
                          <ul className="mt-1 space-y-0.5">{slotDuties.map(renderDuty)}</ul>
                        )}

                        <CoverageRow coverage={coverage} teams={teams} colorFor={colorFor} />

                        {(canSchedule || sheet || canCreateRunSheet) && (
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            {canSchedule && (
                              <SlotAction onClick={() => onSchedule(slot.id)}>
                                <Plus className="size-3" /> Schedule
                              </SlotAction>
                            )}
                            {/* Most services are staffed by last week's team with a
                                name or two changed, so copying beats re-picking. */}
                            {canSchedule && (
                              <SlotAction onClick={() => onCopyRoster(slot.id)}>
                                <Copy className="size-3" /> Copy roster
                              </SlotAction>
                            )}
                            {sheet ? (
                              <Link
                                href={`/run-sheets/${sheet.id}`}
                                title={sheet.title}
                                className="inline-flex h-6 items-center gap-1 rounded-md border border-transparent px-1.5
                                           text-[11px] font-medium text-primary transition-colors
                                           hover:border-border hover:bg-surface"
                              >
                                <ScrollText className="size-3" /> Open run sheet
                              </Link>
                            ) : (
                              canCreateRunSheet && (
                                <SlotAction onClick={() => onCreateRunSheet(slot.id)}>
                                  <ScrollText className="size-3" /> Start run sheet
                                </SlotAction>
                              )
                            )}
                          </div>
                        )}
                      </section>
                    )
                  })}
                </article>
              )
            })}
          </section>
        )}

        {/* Duties that belong to the day rather than to any one service — the sound
            engineer who is in the building from setup to pack-down. */}
        {showAllDay && (
          <section className="border-t border-border-subtle px-4 py-3">
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
              All day
            </p>
            <ul className="space-y-0.5">{unslotted.map(renderDuty)}</ul>
          </section>
        )}
      </div>

      {/* The day-wide escape hatch: someone is on, but not for any one service. */}
      {canSchedule && !dayIsEmpty && (
        <footer className="shrink-0 border-t border-border-subtle px-4 py-2.5">
          <Button size="xs" variant="secondary" onClick={() => onSchedule()}>
            <Plus className="size-3.5" /> Schedule someone
          </Button>
        </footer>
      )}
    </div>,
    document.body
  )
}

/** A quiet chip. Reads as pressable without competing with the names above it. */
function SlotAction({
  onClick,
  children
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-6 items-center gap-1 rounded-md border border-transparent px-1.5
                 text-[11px] font-medium text-muted
                 transition-[background-color,border-color,color] duration-150
                 hover:border-border hover:bg-surface hover:text-foreground
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40
                 active:scale-[0.97]"
    >
      {children}
    </button>
  )
}
