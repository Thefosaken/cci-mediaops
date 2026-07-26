"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

import { cn } from "@/lib/utils/cn"
import { sessionPalette } from "@/app/(dashboard)/run-sheets/[id]/session-colors"

/**
 * The run sheet as a wall display.
 *
 * Read from across a room, on a tablet nobody is holding — so it answers one question
 * in large type ("what is happening now, and how long is left") and keeps everything
 * else subordinate to it. No controls: whoever is looking at this cannot change the
 * service, and offering buttons that do nothing would be worse than offering none.
 *
 * It refreshes itself, because a screen taped to a desk is never going to be reloaded
 * by hand and a run sheet that silently goes stale mid-service is actively misleading.
 */

export interface LiveViewSession {
  id: string
  name: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  people: { id: string; name: string; role: string | null }[]
}

/** How often the clock re-renders. A countdown that ticks per minute reads as stopped. */
const CLOCK_MS = 1_000
/** How often the page re-fetches, so a change made on the desk reaches the tablet. */
const REFRESH_MS = 30_000

export function LiveView({
  title,
  subtitle,
  sessions
}: {
  title: string
  subtitle: string
  sessions: LiveViewSession[]
}) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), CLOCK_MS)
    const refresh = setInterval(() => router.refresh(), REFRESH_MS)
    return () => {
      clearInterval(clock)
      clearInterval(refresh)
    }
  }, [router])

  const ordered = useMemo(
    () => [...sessions].sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time)),
    [sessions]
  )

  const currentIndex = ordered.findIndex(
    (s) => now >= +new Date(s.start_time) && now < +new Date(s.end_time)
  )
  const current = currentIndex >= 0 ? ordered[currentIndex] : null

  // When nothing is running, "next" is the first session still ahead of us — which is
  // what the screen should show before the service starts and after it ends.
  const nextIndex =
    currentIndex >= 0
      ? currentIndex + 1
      : ordered.findIndex((s) => +new Date(s.start_time) > now)
  const next = nextIndex >= 0 && nextIndex < ordered.length ? ordered[nextIndex] : null

  return (
    <main className="min-h-dvh bg-[var(--color-canvas)] px-5 py-6 sm:px-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-semibold tracking-tight text-foreground sm:text-[24px]">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 truncate text-[13px] text-muted">{subtitle}</p>}
        </div>
        <p className="text-[15px] font-medium tabular-nums text-muted sm:text-[17px]">
          {format(now, "h:mm:ss a")}
        </p>
      </header>

      {current ? (
        <NowPlaying session={current} index={currentIndex} now={now} />
      ) : (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-[15px] text-muted">
            {next ? "Not started yet" : "Nothing scheduled right now"}
          </p>
        </div>
      )}

      {next && (
        <section className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
            Next
          </p>
          <UpNext session={next} index={nextIndex} />
        </section>
      )}

      <section className="mt-8">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
          Running order
        </p>
        <ol className="space-y-1.5">
          {ordered.map((s, i) => (
            <Row
              key={s.id}
              session={s}
              index={i}
              now={now}
              isCurrent={s.id === current?.id}
            />
          ))}
        </ol>
      </section>

      <p className="mt-8 text-center text-[11px] text-faint">
        Read-only · updates on its own
      </p>
    </main>
  )
}

/* ────────────────────────────────────────────────────────────────── */

function NowPlaying({
  session,
  index,
  now
}: {
  session: LiveViewSession
  index: number
  now: number
}) {
  const palette = sessionPalette(index)
  const start = +new Date(session.start_time)
  const end = +new Date(session.end_time)
  const progress = Math.min(1, Math.max(0, (now - start) / (end - start)))
  const remaining = Math.max(0, end - now)

  return (
    <section
      className={cn("relative overflow-hidden rounded-xl p-5 sm:p-6", palette.fill)}
      aria-live="polite"
    >
      {/* Elapsed wash — a darkening rather than a tint, so it reads on every hue. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 bg-black/20 transition-[width] duration-1000 ease-linear"
        style={{ width: `${progress * 100}%` }}
      />

      <div className="relative">
        <p className={cn("text-[11px] font-semibold uppercase tracking-[0.12em]", palette.onFillMuted)}>
          On now
        </p>
        <h2
          className={cn(
            "mt-1 text-[28px] font-semibold leading-tight tracking-tight sm:text-[40px]",
            palette.onFill
          )}
        >
          {session.name}
        </h2>

        <div className={cn("mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1", palette.onFillMuted)}>
          <span className="text-[14px] tabular-nums sm:text-[16px]">
            {format(start, "h:mm")}–{format(end, "h:mm a")}
          </span>
          <span className={cn("text-[20px] font-semibold tabular-nums sm:text-[26px]", palette.onFill)}>
            {formatRemaining(remaining)} left
          </span>
        </div>

        {session.notes && (
          <p className={cn("mt-3 max-w-2xl text-[13.5px] leading-relaxed", palette.onFillMuted)}>
            {session.notes}
          </p>
        )}

        {session.people.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {session.people.map((p) => (
              <li
                key={p.id}
                className={cn(
                  "rounded-md px-2 py-1 text-[12.5px] leading-none",
                  palette.avatar
                )}
              >
                {p.name}
                {p.role && <span className="opacity-75"> · {p.role}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function UpNext({ session, index }: { session: LiveViewSession; index: number }) {
  const palette = sessionPalette(index)
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3">
      <span className={cn("h-9 w-1 shrink-0 rounded-full", palette.fill)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-foreground">
          {session.name}
        </span>
        <span className="mt-0.5 block text-[12.5px] tabular-nums text-muted">
          {format(new Date(session.start_time), "h:mm a")}
          {session.people.length > 0 &&
            ` · ${session.people.map((p) => p.name).join(", ")}`}
        </span>
      </span>
    </div>
  )
}

function Row({
  session,
  index,
  now,
  isCurrent
}: {
  session: LiveViewSession
  index: number
  now: number
  isCurrent: boolean
}) {
  const palette = sessionPalette(index)
  const end = +new Date(session.end_time)
  const skipped = session.status === "skipped"
  // Same rule as the timeline: the clock decides what is behind us, not the status flag.
  const past = !isCurrent && (now >= end || session.status === "completed" || skipped)

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-opacity",
        isCurrent ? "border-foreground/25 bg-surface" : "border-border-subtle",
        past && "opacity-40 saturate-50"
      )}
    >
      <span className={cn("h-7 w-1 shrink-0 rounded-full", palette.fill)} />
      <span className="w-[104px] shrink-0 text-[12.5px] tabular-nums text-muted">
        {format(new Date(session.start_time), "h:mm")}–{format(end, "h:mm a")}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[14px]",
          skipped && "line-through",
          isCurrent ? "font-semibold text-foreground" : "text-foreground"
        )}
      >
        {session.name}
      </span>
      {session.people.length > 0 && (
        <span className="hidden shrink-0 truncate text-[12px] text-faint sm:block sm:max-w-[40%]">
          {session.people.map((p) => p.name).join(", ")}
        </span>
      )}
    </li>
  )
}

/** `4:05` rather than `4 minutes` — a countdown is read, not parsed. */
function formatRemaining(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
