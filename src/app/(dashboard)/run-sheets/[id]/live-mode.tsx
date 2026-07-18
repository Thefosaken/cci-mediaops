"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { X, ChevronLeft, SkipForward, Check, ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { Button } from "@/components/ui/button"

/**
 * Live mode — the view a director watches while the service runs.
 *
 * Designed around the one question that actually matters in the moment: are we on
 * time? Everything else is arranged around that answer.
 *
 *   · A countdown, not a clock. "6:42 left" beats "7:00–7:20" when you're running it.
 *   · Drift is tracked and stated plainly. Marking a session done early or late shifts
 *     the whole sheet's real timing, and hiding that helps nobody.
 *   · Cues are the largest text on screen after the session name — they are what the
 *     crew is being read from.
 *   · The ring runs green, then amber under a minute, then red in overrun, so the state
 *     is legible from across a room without reading a number.
 *
 * Kept deliberately quiet: no gratuitous motion. The only things that move are the ones
 * carrying information — the ring, the countdown and the transition between sessions.
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

/** Dial radius in the 100×100 viewBox — leaves room for the round stroke cap. */
const RADIUS = 46

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
        .filter((s) => s.start_time && s.end_time)
        .sort((a, b) => +new Date(a.start_time!) - +new Date(b.start_time!)),
    [sessions]
  )

  const [idx, setIdx] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  /** When the current session actually started, as opposed to when it was meant to. */
  const [actualStart, setActualStart] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const current = ordered[idx]
  const next = ordered[idx + 1]

  const advance = useCallback(
    (status: "completed" | "skipped") => {
      if (current) onMark(current.id, status)
      if (idx < ordered.length - 1) {
        setIdx((i) => i + 1)
        setActualStart(Date.now())
      }
    },
    [current, idx, ordered.length, onMark]
  )

  const goPrev = useCallback(() => {
    setIdx((i) => Math.max(0, i - 1))
    setActualStart(Date.now())
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault()
        advance("completed")
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        goPrev()
      }
      if (e.key === "s" || e.key === "S") advance("skipped")
      if (e.key === "Escape") onExit()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [advance, goPrev, onExit])

  if (!current) {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-canvas p-8">
        <div className="space-y-3 text-center">
          <p className="text-[15px] font-medium text-foreground">Nothing to run</p>
          <p className="text-[13px] text-muted">This sheet has no sessions yet.</p>
          <Button variant="secondary" size="sm" onClick={onExit}>
            Back to timeline
          </Button>
        </div>
      </div>
    )
  }

  const plannedMs = +new Date(current.end_time!) - +new Date(current.start_time!)
  const elapsedMs = now - actualStart
  const remainingMs = plannedMs - elapsedMs
  const over = remainingMs < 0
  const ratio = Math.min(1, Math.max(0, elapsedMs / plannedMs))

  /** Drift against the plan, if we finished this session right now. */
  const driftMs = elapsedMs - plannedMs
  /** 30s either way is noise, not information — a director shouldn't chase it. */
  const onTime = Math.abs(driftMs) < 30_000
  const urgent = !over && remainingMs < 60_000

  const ringColor = over ? "var(--color-danger)" : urgent ? "var(--warning)" : "var(--color-primary)"

  const filledCues = current.run_sheet_session_cues
    .map((c) => ({
      name: subTeams.find((st) => st.id === c.sub_team_id)?.name ?? "Unit",
      text: c.cue_text,
    }))
    .filter((c) => c.text && c.text.trim() !== "")

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-canvas">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger/70" />
            <span className="relative inline-flex size-2 rounded-full bg-danger" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-danger">Live</span>
          <span className="text-border">/</span>
          <span className="truncate text-[13px] font-medium text-foreground">{sheetTitle}</span>
          {subtitle && <span className="truncate text-[12.5px] text-muted">· {subtitle}</span>}
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden text-[12px] tabular-nums text-muted sm:block">
            {format(now, "h:mm:ss a")}
          </span>
          <Button variant="secondary" size="sm" onClick={onExit}>
            <X className="size-3.5" /> End
          </Button>
        </div>
      </header>

      {/* ── Progress rail ─────────────────────────────────────── */}
      <div className="flex shrink-0 gap-1 px-6 py-3">
        {ordered.map((s, i) => (
          <button
            key={s.id}
            onClick={() => {
              setIdx(i)
              setActualStart(Date.now())
            }}
            title={`${i + 1}. ${s.name}`}
            className="group relative h-1 flex-1 overflow-hidden rounded-full bg-border transition-colors"
          >
            <span
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-[var(--ease-out-expo)]",
                i < idx ? "w-full bg-foreground/35" : i === idx ? "bg-primary" : "w-0"
              )}
              style={i === idx ? { width: `${ratio * 100}%` } : undefined}
            />
          </button>
        ))}
      </div>


      {/* ── Stage ─────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: over
              ? "radial-gradient(60% 50% at 50% 45%, color-mix(in oklab, var(--color-danger) 11%, transparent), transparent 70%)"
              : "radial-gradient(60% 50% at 50% 45%, color-mix(in oklab, var(--color-primary) 7%, transparent), transparent 70%)",
            transition: "background 600ms var(--ease-out-quart)",
          }}
        />

        <div className="relative flex w-full max-w-3xl flex-col items-center">
          {/* Session identity above the dial — named, but not shouting. */}
          <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-faint">
            Now · {idx + 1} of {ordered.length}
          </p>
          <h1
            key={current.id}
            className="mt-2 animate-[slide-up_var(--duration-medium)_var(--ease-out-expo)] text-center
                       text-[clamp(1.25rem,2.4vw,1.7rem)] font-semibold leading-tight tracking-[-0.015em] text-foreground"
          >
            {current.name}
          </h1>
          <p className="mt-1 text-[12px] tabular-nums text-muted">
            {format(new Date(current.start_time!), "h:mm")} –{" "}
            {format(new Date(current.end_time!), "h:mm a")}
            <span className="mx-1.5 text-faint">·</span>
            {Math.round(plannedMs / 60_000)} min planned
          </p>

          {/* The dial. The largest thing on screen, because it answers the question
              you are actually asking every few seconds. */}
          <div
            className="relative mt-6"
            style={{ width: "min(52vh, 380px)", height: "min(52vh, 380px)" }}
          >
            <svg viewBox="0 0 100 100" className="size-full -rotate-90">
              <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--color-border)" strokeWidth="2.5" />
              <circle
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                stroke={ringColor}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * RADIUS}
                strokeDashoffset={2 * Math.PI * RADIUS * (1 - ratio)}
                className="transition-[stroke-dashoffset,stroke] duration-1000 ease-linear"
                style={{
                  filter: over
                    ? "drop-shadow(0 0 3px color-mix(in oklab, var(--color-danger) 60%, transparent))"
                    : undefined,
                }}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={cn(
                  "font-semibold tabular-nums leading-none tracking-[-0.04em]",
                  "text-[clamp(3rem,11vh,5.5rem)]",
                  over ? "text-danger" : urgent ? "text-[var(--warning)]" : "text-foreground"
                )}
              >
                {over && "+"}
                {clock(Math.abs(remainingMs))}
              </span>
              <span className="mt-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
                {over ? "over" : "remaining"}
              </span>

              <span
                className={cn(
                  "mt-4 rounded-full px-2.5 py-1 text-[11.5px] font-medium tabular-nums",
                  onTime
                    ? "bg-[var(--success-soft)] text-[var(--success)]"
                    : driftMs > 0
                      ? "bg-[var(--color-danger-soft)] text-danger"
                      : "bg-[var(--color-info-soft)] text-[var(--color-info)]"
                )}
              >
                {onTime ? "On time" : `${clock(Math.abs(driftMs))} ${driftMs > 0 ? "behind" : "ahead"}`}
              </span>
            </div>
          </div>

          {/* Cues sit under the dial, still the largest reading text. */}
          {filledCues.length > 0 && (
            <ul className="mt-7 grid w-full gap-2.5 sm:grid-cols-2">
              {filledCues.map((c, i) => (
                <li
                  key={c.name}
                  style={{ animationDelay: `${i * 45}ms` }}
                  className="animate-[slide-up_var(--duration-medium)_var(--ease-out-expo)_backwards]
                             relative overflow-hidden rounded-md border border-border bg-surface p-3.5"
                >
                  <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary/60" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {c.name}
                  </p>
                  <p className="mt-1.5 text-[15px] leading-snug text-foreground">{c.text}</p>
                </li>
              ))}
            </ul>
          )}

          {current.run_sheet_session_members.length > 0 && (
            <p className="mt-5 text-center text-[12.5px] text-muted">
              {current.run_sheet_session_members
                .map((m) => m.users?.full_name ?? m.role_title ?? "Unassigned")
                .join(" · ")}
            </p>
          )}

          {current.notes && (
            <p className="mt-4 w-full rounded-md border border-border-subtle bg-[var(--surface-subtle)] p-3.5 text-[13px] leading-relaxed text-foreground">
              {current.notes}
            </p>
          )}
        </div>
      </div>

      {/* ── Controls ──────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-border px-6 py-3.5">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Button variant="ghost" onClick={goPrev} disabled={idx === 0}>
            <ChevronLeft className="size-3.5" /> Back
          </Button>

          {/* What's coming, stated as a destination rather than a footnote. */}
          {next ? (
            <div className="hidden min-w-0 flex-1 items-center justify-center gap-2.5 px-4 sm:flex">
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
                Up next
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-faint" />
              <span className="truncate text-[13.5px] font-medium text-foreground">{next.name}</span>
              <span className="shrink-0 rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[11px] tabular-nums text-muted">
                {format(new Date(next.start_time!), "h:mm a")}
              </span>
            </div>
          ) : (
            <p className="hidden flex-1 px-4 text-center text-[12.5px] text-faint sm:block">
              Last session
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => advance("skipped")}>
              <SkipForward className="size-3.5" /> Skip
            </Button>
            <Button onClick={() => advance("completed")} disabled={idx === ordered.length - 1}>
              <Check className="size-3.5" /> Done
            </Button>
          </div>
        </div>

        <p className="mt-2.5 text-center text-[10.5px] text-faint">
          <Key>space</Key> done · <Key>←</Key> back · <Key>S</Key> skip · <Key>esc</Key> end
        </p>
      </footer>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface px-1 py-px font-mono text-[9.5px] text-muted">
      {children}
    </kbd>
  )
}

/** m:ss, or h:mm:ss once it runs past an hour. */
function clock(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
