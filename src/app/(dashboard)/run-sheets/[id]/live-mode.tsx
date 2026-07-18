"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Square, ChevronLeft, SkipForward, Check } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { Button } from "@/components/ui/button"

/**
 * Full-screen live view for running a service.
 *
 * Ported from the segment-based version. The differences that matter: sessions are
 * ordered by start_time rather than a sequence_order column, cues come from the
 * per-sub-team table so they reflect the units this campus actually has, and each
 * session shows its real clock times.
 *
 * Parked sessions are excluded — a session with no time cannot be run.
 */

interface LiveSession {
  id: string
  name: string
  start_time: string | null
  end_time: string | null
  session_type: string | null
  notes: string | null
  run_sheet_session_cues: { id: string; sub_team_id: string; cue_text: string | null }[]
  run_sheet_session_members: {
    id: string
    role_title: string | null
    users: { id: string; full_name: string } | null
  }[]
}

export function LiveMode({
  sheetTitle,
  subtitle,
  sessions,
  subTeams,
  onExit,
  onMark,
}: {
  sheetTitle: string
  subtitle?: string
  sessions: LiveSession[]
  subTeams: { id: string; name: string }[]
  onExit: () => void
  onMark: (sessionId: string, status: "completed" | "skipped") => void
}) {
  const ordered = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.start_time)
        .sort((a, b) => new Date(a.start_time!).getTime() - new Date(b.start_time!).getTime()),
    [sessions]
  )

  const [idx, setIdx] = useState(0)
  const current = ordered[idx]
  const next = ordered[idx + 1]

  const goNext = () => setIdx((i) => Math.min(i + 1, ordered.length - 1))
  const goPrev = () => setIdx((i) => Math.max(i - 1, 0))

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault()
        if (current) onMark(current.id, "completed")
        goNext()
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        goPrev()
      }
      if (e.key === "Escape") onExit()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [current, onExit, onMark])

  if (!current) {
    return (
      <div className="fixed inset-0 z-[60] bg-canvas grid place-items-center p-8">
        <div className="text-center space-y-3">
          <p className="text-[15px] text-foreground">Nothing scheduled to run.</p>
          <p className="text-[13px] text-muted">
            Sessions need a start time before they appear in live mode.
          </p>
          <Button variant="secondary" size="sm" onClick={onExit}>Back to timeline</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] bg-canvas flex flex-col">
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-surface">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-2 w-2 rounded-full bg-danger animate-pulse" />
          <span className="text-[11.5px] font-semibold uppercase tracking-wider text-danger">Live</span>
          <span className="text-faint">·</span>
          <span className="text-[13px] font-medium text-foreground truncate">{sheetTitle}</span>
          {subtitle && (
            <>
              <span className="text-faint">·</span>
              <span className="text-[12px] text-muted truncate">{subtitle}</span>
            </>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={onExit}>
          <Square className="h-3.5 w-3.5" /> End live
        </Button>
      </header>

      {/* Progress */}
      <div className="px-5 py-2 border-b border-border bg-canvas/95">
        <div className="flex items-center gap-1">
          {ordered.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setIdx(i)}
              title={`${i + 1}. ${s.name}`}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-colors",
                i < idx ? "bg-foreground/40" : i === idx ? "bg-primary" : "bg-border"
              )}
            />
          ))}
        </div>
        <p className="text-[11px] text-faint mt-1.5 tabular-nums">
          {idx + 1} of {ordered.length}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-faint mb-2">
              Current session
            </p>
            <h1 className="text-[40px] font-semibold tracking-tight text-foreground leading-[1.05]">
              {current.name}
            </h1>
            <p className="text-[13px] text-muted mt-2 tabular-nums">
              {format(new Date(current.start_time!), "h:mm a")} –{" "}
              {format(new Date(current.end_time!), "h:mm a")}
              {current.session_type && ` · ${current.session_type.replace(/_/g, " ")}`}
            </p>
          </div>

          {/* Cues, one card per unit that has something to say. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {subTeams.map((st) => {
              const cue = current.run_sheet_session_cues.find((c) => c.sub_team_id === st.id)
              return (
                <div key={st.id} className="rounded-lg border border-border bg-surface p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                    {st.name}
                  </div>
                  <p
                    className={cn(
                      "text-[14px] leading-snug",
                      cue?.cue_text ? "text-foreground" : "text-faint italic"
                    )}
                  >
                    {cue?.cue_text || "No cue"}
                  </p>
                </div>
              )
            })}
          </div>

          {current.run_sheet_session_members.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-2">On this session</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {current.run_sheet_session_members.map((m) => (
                  <span key={m.id} className="text-[13px] text-foreground">
                    {m.users?.full_name ?? m.role_title ?? "Unassigned"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {current.notes && (
            <div className="rounded-lg border border-border bg-surface-subtle/40 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-1.5">Notes</p>
              <p className="text-[14px] text-foreground leading-snug whitespace-pre-wrap">{current.notes}</p>
            </div>
          )}

          {next && (
            <p className="text-[13px] text-muted">
              Up next · <span className="text-foreground font-medium">{next.name}</span>{" "}
              <span className="tabular-nums">{format(new Date(next.start_time!), "h:mm a")}</span>
            </p>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-surface">
        <Button variant="secondary" onClick={goPrev} disabled={idx === 0}>
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              onMark(current.id, "skipped")
              goNext()
            }}
          >
            <SkipForward className="h-3.5 w-3.5" /> Skip
          </Button>
          <Button
            onClick={() => {
              onMark(current.id, "completed")
              goNext()
            }}
            disabled={idx === ordered.length - 1}
          >
            <Check className="h-3.5 w-3.5" /> Done · next
          </Button>
        </div>
      </footer>
    </div>
  )
}
