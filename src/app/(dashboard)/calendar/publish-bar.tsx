"use client"

import { useState } from "react"
import { format } from "date-fns"
import { Eye, EyeOff, Send } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { publishRoster } from "@/server/actions/duties"
import { TEAM_COLORS, type TeamColor } from "./team-colors"

import { Button } from "@/components/ui/button"

/**
 * The bar that appears when there is unpublished work in view.
 *
 * A month's roster is wrong for most of the time it takes to build. Drafts let that
 * happen privately, but a draft nobody remembers to publish is worse than no draft at
 * all — the lead thinks the month is done and the team never hears. So the bar is
 * unmissable while drafts exist and gone the moment they don't, rather than living in
 * a menu somebody has to think to open.
 *
 * It reports what will happen before it happens: how many duties, across which teams,
 * and how many people will be written to. "Publish 34 duties" is a number; "tells 11
 * people" is the consequence.
 */

export interface DraftSummary {
  total: number
  /** Draft count per team, so a lead can see whose work is outstanding. */
  byTeam: Record<string, number>
  /** Distinct people who would receive a message. */
  peopleCount: number
}

export function PublishBar({
  drafts,
  teams,
  colorFor,
  windowStart,
  windowEnd,
  canPublish,
  showingDrafts,
  onToggleShowDrafts,
  onDone,
  onError
}: {
  drafts: DraftSummary
  teams: { id: string; name: string; color: string | null }[]
  colorFor: Map<string, TeamColor>
  /** The visible range. Publishing acts on exactly what is on screen, nothing more. */
  windowStart: Date
  windowEnd: Date
  /** False for an assistant lead: they build the roster, the lead releases it. */
  canPublish: boolean
  showingDrafts: boolean
  onToggleShowDrafts: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const [publishing, setPublishing] = useState(false)

  if (drafts.total === 0) return null

  const teamsWithDrafts = teams.filter((t) => (drafts.byTeam[t.id] ?? 0) > 0)

  const publish = async () => {
    setPublishing(true)
    const res = await publishRoster({
      from: format(windowStart, "yyyy-MM-dd"),
      to: format(windowEnd, "yyyy-MM-dd")
    })
    setPublishing(false)

    if (res.error) return onError(res.error)
    onDone(
      `Published ${res.published} ${res.published === 1 ? "duty" : "duties"} · ${res.notified} ${
        res.notified === 1 ? "person" : "people"
      } notified`
    )
  }

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--warning)]/25
                 bg-[var(--warning)]/[0.07] px-5 py-2 sm:px-6"
    >
      <span className="flex items-center gap-2">
        <span className="relative flex size-2">
          {/* Draws the eye without demanding a click — this is a reminder, not an alert. */}
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--warning)] opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-[var(--warning)]" />
        </span>
        <span className="text-[12.5px] font-medium text-foreground">
          {drafts.total} unpublished {drafts.total === 1 ? "duty" : "duties"}
        </span>
      </span>

      {/* Whose work is outstanding, so a lead with three teams knows where to look. */}
      {teamsWithDrafts.length > 0 && (
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {teamsWithDrafts.map((t) => (
            <span key={t.id} className="flex items-center gap-1.5 text-[11.5px] text-muted">
              <span className={cn("size-1.5 rounded-full", TEAM_COLORS[colorFor.get(t.id) ?? "blue"].dot)} />
              {t.name}
              <span className="tabular-nums text-faint">{drafts.byTeam[t.id]}</span>
            </span>
          ))}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button size="xs" variant="ghost" onClick={onToggleShowDrafts}>
          {showingDrafts ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {showingDrafts ? "Hide drafts" : "Show drafts"}
        </Button>

        {canPublish ? (
          <Button size="xs" loading={publishing} onClick={publish}>
            <Send className="size-3.5" />
            Publish {format(windowStart, "MMM")}
          </Button>
        ) : (
          // An assistant lead sees the state of play and who has to act on it, rather
          // than a disabled button that reads as something being broken.
          <span className="text-[11.5px] text-muted">Your lead publishes this</span>
        )}
      </div>

      {drafts.peopleCount > 0 && canPublish && (
        <p className="w-full text-[11px] text-muted">
          Publishing writes to {drafts.peopleCount} {drafts.peopleCount === 1 ? "person" : "people"} —
          one message each covering every date they were given. Nobody has been told yet.
        </p>
      )}
    </div>
  )
}
