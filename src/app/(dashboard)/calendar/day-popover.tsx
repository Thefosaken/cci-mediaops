"use client"

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { format } from "date-fns"
import { Check, Plus, ScrollText, Trash2, X as XIcon } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { TEAM_COLORS, type TeamColor } from "./team-colors"

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
 */

const WIDTH = 320
const GAP = 8

export interface PopoverDuty {
  id: string
  user_id: string
  sub_team_id: string
  role_title: string | null
  status: string
  users: { id: string; full_name: string } | null
  sub_teams: { id: string; name: string; color: string | null } | null
}

export interface PopoverEvent {
  id: string
  title: string
  start_time: string
  location: string | null
}

export function DayPopover({
  date,
  anchor,
  events,
  duties,
  runSheetFor,
  colorFor,
  currentUserId,
  canSchedule,
  onClose,
  onSchedule,
  onRespond,
  onRemove,
}: {
  date: Date
  anchor: DOMRect
  events: PopoverEvent[]
  duties: PopoverDuty[]
  runSheetFor: (eventId: string) => { id: string } | undefined
  colorFor: Map<string, TeamColor>
  currentUserId: string
  canSchedule: boolean
  onClose: () => void
  onSchedule: () => void
  onRespond: (dutyId: string, status: "confirmed" | "declined") => void
  onRemove: (dutyId: string) => void
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
        {events.length > 0 && (
          <section className="border-b border-border-subtle px-4 py-3">
            <ul className="space-y-2">
              {events.map((ev) => {
                const sheet = runSheetFor(ev.id)
                return (
                  <li key={ev.id}>
                    <p className="text-[13px] font-medium text-foreground">{ev.title}</p>
                    <p className="mt-0.5 text-[11.5px] tabular-nums text-muted">
                      {format(new Date(ev.start_time), "h:mm a")}
                      {ev.location && ` · ${ev.location}`}
                    </p>
                    {sheet && (
                      <Link
                        href={`/run-sheets/${sheet.id}`}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
                      >
                        <ScrollText className="size-3.5" />
                        Open run sheet
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section className="px-4 py-3">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
            On duty
          </p>

          {duties.length === 0 ? (
            <p className="text-[12.5px] text-faint">Nobody rostered</p>
          ) : (
            <ul className="space-y-1">
              {duties.map((d) => {
                const mine = d.user_id === currentUserId
                const palette = TEAM_COLORS[colorFor.get(d.sub_team_id) ?? "blue"]
                return (
                  <li key={d.id} className="group flex items-center gap-2 py-1">
                    <span className={cn("size-2 shrink-0 rounded-full", palette.dot)} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-[12.5px]",
                          d.status === "declined"
                            ? "text-faint line-through"
                            : "text-foreground"
                        )}
                      >
                        {d.users?.full_name ?? "Unassigned"}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        {d.sub_teams?.name}
                        {d.role_title && ` · ${d.role_title}`}
                      </span>
                    </span>

                    {d.status === "confirmed" && (
                      <Check className="size-3.5 shrink-0 text-[var(--success)]" />
                    )}
                    {d.status === "declined" && <Badge variant="danger">declined</Badge>}

                    {mine && d.status === "scheduled" && (
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
              })}
            </ul>
          )}

          {canSchedule && (
            <Button size="xs" variant="secondary" className="mt-2.5" onClick={onSchedule}>
              <Plus className="size-3.5" /> Schedule someone
            </Button>
          )}
        </section>
      </div>
    </div>,
    document.body
  )
}
