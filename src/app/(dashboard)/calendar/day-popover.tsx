"use client"

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { format } from "date-fns"
import {
  CalendarPlus,
  Check,
  Copy,
  Pencil,
  Plus,
  ScrollText,
  Trash2,
  X as XIcon
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { coverageForSlot } from "@/lib/utils/rostering"
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
 * that would otherwise clip it — the same reason Select portals (see CLAUDE.md).
 *
 * The day is now told in three levels: the event, the services inside it, and the
 * people inside each service. That nesting exists because a Sunday is not one roster
 * but two or three, and a name is only meaningful once you know which service it
 * belongs to. Everything stays inside 320px, so each level buys its indentation with
 * information rather than with chrome.
 */

const WIDTH = 320
const GAP = 8

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

  // Sit beside the cell, flipping and clamping so it never leaves the viewport.
  const spaceRight = window.innerWidth - anchor.right
  const left =
    spaceRight > WIDTH + GAP
      ? anchor.right + GAP
      : Math.max(GAP, anchor.left - WIDTH - GAP)
  const top = Math.min(Math.max(GAP, anchor.top), window.innerHeight - 380)

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
      <li key={d.id} className="group flex items-center gap-2 py-1">
        <span className={cn("size-2 shrink-0 rounded-full", palette.dot)} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[12.5px]",
              d.status === "declined" ? "text-faint line-through" : "text-foreground"
            )}
          >
            {d.users?.full_name ?? "Unassigned"}
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
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
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
      style={{ left, top, width: WIDTH }}
      className="fixed z-[70] overflow-hidden rounded-xl border border-border bg-[var(--color-canvas-elevated)]
                 shadow-[var(--shadow-elevation-lg)] animate-[scale-in_160ms_var(--ease-out-expo)]"
    >
      <header className="flex items-start justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">
            {format(date, "EEEE")}
          </p>
          <p className="text-[17px] font-semibold leading-tight tracking-tight text-foreground">
            {format(date, "d MMMM")}
          </p>
        </div>
        <IconButton label="Close" size="xs" variant="ghost" onClick={onClose}>
          <XIcon className="size-3.5" />
        </IconButton>
      </header>

      <div className="max-h-[320px] overflow-y-auto">
        {/* An empty day is the one place the calendar can offer the thing it is for.
            Without the right to create events it stays a plain statement of fact. */}
        {dayIsEmpty && (
          <section className="px-4 py-5 text-center">
            <p className="text-[12.5px] text-faint">Nothing on this day</p>
            <div className="mt-2.5 flex items-center justify-center gap-1.5">
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
          <section className="border-b border-border-subtle px-4 py-3">
            <ul className="space-y-3.5">
              {events.map((ev) => {
                const cancelled = ev.status === "cancelled"
                return (
                  <li key={ev.id}>
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "truncate text-[13px] font-medium",
                            cancelled ? "text-faint line-through" : "text-foreground"
                          )}
                        >
                          {ev.title}
                        </p>
                        <p className="mt-0.5 truncate text-[11.5px] tabular-nums text-muted">
                          {format(new Date(ev.start_time), "h:mm a")}
                          {ev.location && ` · ${ev.location}`}
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
                          <ul className="space-y-1">{unslotted.map(renderDuty)}</ul>
                        )}
                      </div>
                    )}

                    {ev.slots.map((slot) => {
                      const slotDuties = duties.filter((d) => d.slot_id === slot.id)
                      const coverage = coverageForSlot(slot.requirements, slotDuties)
                      const sheet = runSheetFor(slot.id)
                      return (
                        <div
                          key={slot.id}
                          className="mt-2 rounded-lg border border-border-subtle bg-[var(--surface-subtle)] px-2.5 py-2"
                        >
                          <div className="flex items-center gap-1.5">
                            {/* The order marker, not the label, is what tells you which
                                service this is when two are called the same thing. */}
                            <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-[var(--color-canvas-elevated)] text-[10.5px] font-semibold tabular-nums text-muted">
                              {slot.slot_order}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                              {slot.label}
                            </span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted">
                              {format(new Date(slot.start_time), "h:mm a")}
                            </span>
                          </div>

                          {slotDuties.length === 0 ? (
                            // With nobody on, the shortfall is the whole story, so the
                            // summary stands in for a list that would say nothing.
                            <p className="mt-1.5 text-[12px] text-faint">
                              {coverageSummary(coverage)}
                            </p>
                          ) : (
                            <ul className="mt-1 space-y-1">{slotDuties.map(renderDuty)}</ul>
                          )}

                          <CoverageRow coverage={coverage} teams={teams} colorFor={colorFor} />

                          {(canSchedule || sheet || canCreateRunSheet) && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                              {canSchedule && (
                                <button
                                  type="button"
                                  onClick={() => onSchedule(slot.id)}
                                  className="inline-flex items-center gap-1 text-[11.5px] text-muted transition-colors hover:text-foreground"
                                >
                                  <Plus className="size-3" /> Schedule
                                </button>
                              )}
                              {/* Most services are staffed by last week's team with a
                                  name or two changed, so copying beats re-picking. */}
                              {canSchedule && (
                                <button
                                  type="button"
                                  onClick={() => onCopyRoster(slot.id)}
                                  className="inline-flex items-center gap-1 text-[11.5px] text-muted transition-colors hover:text-foreground"
                                >
                                  <Copy className="size-3" /> Copy roster
                                </button>
                              )}
                              {sheet ? (
                                <Link
                                  href={`/run-sheets/${sheet.id}`}
                                  title={sheet.title}
                                  className="inline-flex items-center gap-1 text-[11.5px] text-primary hover:underline"
                                >
                                  <ScrollText className="size-3" /> Open run sheet
                                </Link>
                              ) : (
                                canCreateRunSheet && (
                                  <button
                                    type="button"
                                    onClick={() => onCreateRunSheet(slot.id)}
                                    className="inline-flex items-center gap-1 text-[11.5px] text-muted transition-colors hover:text-foreground"
                                  >
                                    <ScrollText className="size-3" /> Start run sheet
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Duties that belong to the day rather than to any one service — the sound
            engineer who is in the building from setup to pack-down. */}
        {showAllDay && (
          <section className="px-4 py-3">
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
              All day
            </p>
            <ul className="space-y-1">{unslotted.map(renderDuty)}</ul>
          </section>
        )}

        {/* The day-wide escape hatch: someone is on, but not for any one service. */}
        {canSchedule && !dayIsEmpty && (
          <div className="px-4 pb-3 pt-1">
            <Button size="xs" variant="secondary" onClick={() => onSchedule()}>
              <Plus className="size-3.5" /> Schedule someone
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
