"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Plus, Clock, Users, Inbox, ArrowRight, Trash2, CornerUpLeft, Copy, BookmarkPlus, Play } from "lucide-react"

import { useToast } from "@/lib/toast/toast-context"
import { isPlaced, type RunSheetSession } from "@/types"
import type { CascadePlan } from "@/lib/utils/run-sheet-timeline"
import {
  createSession,
  previewRetime,
  applyRetime,
  parkSession,
  deleteSession,
  setCue,
  addSessionMember,
  removeSessionMember,
  setSessionStatus,
  setRunSheetStatus,
} from "@/server/actions/run-sheets/sessions"
import { duplicateRunSheet, saveAsTemplate } from "@/server/actions/run-sheets/templates"
import { LiveMode } from "./live-mode"

import { PageHeader } from "@/components/ui/page-header"
import { Button, IconButton } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { SidePanel } from "@/components/ui/side-panel"
import { FormField } from "@/components/ui/form-field"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"

/** Pixels per hour on the timeline. Wide enough to read a session name in a short slot. */
const HOUR_PX = 150
/** Fallback window when a sheet has no placed sessions to derive one from. */
const DEFAULT_START_HOUR = 7
const DEFAULT_HOURS = 8

type SessionRow = RunSheetSession & {
  run_sheet_session_cues: { id: string; sub_team_id: string; cue_text: string | null }[]
  run_sheet_session_members: {
    id: string
    user_id: string | null
    sub_team_id: string | null
    role_title: string | null
    confirmation_status: string
    users: { id: string; full_name: string } | null
  }[]
}

interface Props {
  sheet: {
    id: string
    title: string
    status: string
    sheet_date: string | null
    events: { id: string; title: string; start_time: string } | null
  }
  sessions: SessionRow[]
  subTeams: { id: string; name: string }[]
  users: { id: string; full_name: string }[]
  canEdit: boolean
}

export function RunSheetTimelineClient({ sheet, sessions, subTeams, users, canEdit }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const [createAt, setCreateAt] = useState<Date | null>(null)
  const [cascade, setCascade] = useState<{ plan: CascadePlan; apply: () => void } | null>(null)
  const [copyMode, setCopyMode] = useState<"duplicate" | "template" | null>(null)
  const [live, setLive] = useState(false)

  const placed = useMemo(() => sessions.filter(isPlaced), [sessions])
  const parked = useMemo(() => sessions.filter((s) => !isPlaced(s)), [sessions])

  /**
   * The visible window. Derived from the sessions themselves so a sheet that runs
   * 06:00–23:00 isn't clipped, with a sensible default for an empty sheet.
   */
  const { windowStart, hourCount } = useMemo(() => {
    if (placed.length === 0) {
      const base = sheet.sheet_date ? new Date(`${sheet.sheet_date}T00:00:00`) : new Date()
      base.setHours(DEFAULT_START_HOUR, 0, 0, 0)
      return { windowStart: base, hourCount: DEFAULT_HOURS }
    }

    const starts = placed.map((s) => new Date(s.start_time!).getTime())
    const ends = placed.map((s) => new Date(s.end_time!).getTime())

    const first = new Date(Math.min(...starts))
    first.setMinutes(0, 0, 0)
    const last = new Date(Math.max(...ends))

    // One hour of breathing room after the final session, so the last bar isn't flush
    // against the edge and there is somewhere to click to add.
    const hours = Math.max(
      DEFAULT_HOURS,
      Math.ceil((last.getTime() - first.getTime()) / 3_600_000) + 1
    )
    return { windowStart: first, hourCount: hours }
  }, [placed, sheet.sheet_date])

  const hours = useMemo(
    () => Array.from({ length: hourCount }, (_, i) => new Date(windowStart.getTime() + i * 3_600_000)),
    [windowStart, hourCount]
  )

  const openSession = sessions.find((s) => s.id === openSessionId) ?? null

  const refresh = () => router.refresh()

  const guard = <T,>(fn: () => Promise<T>) =>
    startTransition(async () => {
      const res = (await fn()) as { error?: string } | undefined
      if (res?.error) toast.error(res.error)
      else refresh()
    })

  /** Retime with a preview step, so a cascade is never silent. */
  const requestRetime = (sessionId: string, start: string, end: string) => {
    startTransition(async () => {
      const res = await previewRetime(sheet.id, sessionId, start, end)
      if ("error" in res) return toast.error(res.error)

      if (res.plan.conflicts.length > 0) {
        return toast.error(
          `That time runs into ${res.plan.conflicts.map((c) => c.name).join(", ")}`
        )
      }

      const commit = () =>
        guard(async () => {
          const r = await applyRetime(sheet.id, sessionId, start, end)
          if (!r.error) {
            setCascade(null)
            setOpenSessionId(null)
            toast.success(r.moved ? `Moved ${r.moved} later session${r.moved > 1 ? "s" : ""}` : "Session updated")
          }
          return r
        })

      // Nothing else is displaced — no need to interrupt with a dialog.
      if (res.plan.moves.length === 0) return commit()
      setCascade({ plan: res.plan, apply: commit })
    })
  }

  if (live) {
    return (
      <LiveMode
        sheetTitle={sheet.title}
        subtitle={sheet.events?.title}
        sessions={placed}
        subTeams={subTeams}
        onMark={(id, status) => {
          void setSessionStatus(id, status)
        }}
        onExit={() => {
          setLive(false)
          void setRunSheetStatus(sheet.id, "completed")
          refresh()
        }}
      />
    )
  }

  return (
    <>
      <PageHeader
        title={sheet.title}
        description={
          sheet.events?.title ??
          (sheet.sheet_date ? format(new Date(sheet.sheet_date), "EEEE d MMMM yyyy") : "Standalone run sheet")
        }
        actions={
          canEdit ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setCopyMode("duplicate")}>
                <Copy className="size-4" />
                Duplicate
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCopyMode("template")}>
                <BookmarkPlus className="size-4" />
                Save as template
              </Button>
              <Button size="sm" onClick={() => setCreateAt(hours[0])}>
                <Plus className="size-4" />
                Add session
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={placed.length === 0}
                title={placed.length === 0 ? "Give a session a start time first" : undefined}
                onClick={() => {
                  setLive(true)
                  setRunSheetStatus(sheet.id, "live")
                }}
              >
                <Play className="size-4" />
                Start live
              </Button>
            </div>
          ) : (
            <Badge variant="muted">View only</Badge>
          )
        }
      />

      <div className="px-6 pb-10 space-y-6">
        {/* ── Timeline ─────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-surface overflow-x-auto">
          <div style={{ width: hourCount * HOUR_PX, minWidth: "100%" }}>
            {/* Hour ruler */}
            <div className="flex border-b border-border">
              {hours.map((h, i) => (
                <div
                  key={i}
                  style={{ width: HOUR_PX }}
                  className="shrink-0 border-r border-border last:border-r-0 px-2 py-2 group relative"
                >
                  <span className="text-[12px] font-medium text-muted">{format(h, "h a")}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setCreateAt(h)}
                      title={`Add a session at ${format(h, "h a")}`}
                      className="absolute right-1 top-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100
                                 transition-opacity rounded p-0.5 hover:bg-surface-hover text-muted hover:text-foreground"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Session bars */}
            <div className="relative" style={{ height: Math.max(120, placed.length * 44 + 24) }}>
              {/* Hour gridlines, echoing the ruler above. */}
              <div className="absolute inset-0 flex pointer-events-none">
                {hours.map((_, i) => (
                  <div key={i} style={{ width: HOUR_PX }} className="shrink-0 border-r border-border/50 last:border-r-0" />
                ))}
              </div>

              {placed.length === 0 ? (
                <div className="absolute inset-0 grid place-items-center">
                  <p className="text-[13px] text-muted">
                    Nothing scheduled yet{canEdit && " — use + on an hour to add a session"}
                  </p>
                </div>
              ) : (
                placed.map((s, i) => {
                  const start = new Date(s.start_time!).getTime()
                  const end = new Date(s.end_time!).getTime()
                  const left = ((start - windowStart.getTime()) / 3_600_000) * HOUR_PX
                  const width = Math.max(((end - start) / 3_600_000) * HOUR_PX, 56)
                  const cueCount = s.run_sheet_session_cues.filter(
                    (c) => c.cue_text && c.cue_text.trim() !== ""
                  ).length

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setOpenSessionId(s.id)}
                      style={{ left, width, top: i * 44 + 12 }}
                      className="absolute h-9 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20
                                 px-2.5 text-left transition-colors overflow-hidden"
                    >
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {s.name}
                        {cueCount > 0 && (
                          <span className="text-muted font-normal"> ({cueCount} cue{cueCount > 1 ? "s" : ""})</span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        {format(new Date(s.start_time!), "h:mm")}–{format(new Date(s.end_time!), "h:mm a")}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* ── Parking tray ─────────────────────────────────────── */}
        {parked.length > 0 && (
          <div className="rounded-lg border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <Inbox className="size-4 text-muted" />
              <h2 className="text-[13px] font-medium text-foreground">Needs times</h2>
              <Badge variant="neutral">{parked.length}</Badge>
              <p className="text-[12px] text-muted ml-1">
                Carried over without a start time. Give one to place it on the timeline.
              </p>
            </div>
            <ul className="divide-y divide-border">
              {parked.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex-1 truncate text-[13px] text-foreground">{s.name}</span>
                  {s.session_type && <Badge variant="neutral">{s.session_type}</Badge>}
                  <Button size="xs" variant="ghost" onClick={() => setOpenSessionId(s.id)}>
                    {canEdit ? "Set times" : "View"}
                    <ArrowRight className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Create ───────────────────────────────────────────── */}
      {createAt && canEdit && (
        <CreateSessionModal
          at={createAt}
          busy={pending}
          onClose={() => setCreateAt(null)}
          onSubmit={(values) =>
            guard(async () => {
              const r = await createSession({ runSheetId: sheet.id, ...values })
              if (!r.error) {
                setCreateAt(null)
                toast.success("Session added")
              }
              return r
            })
          }
        />
      )}

      {/* ── Detail ───────────────────────────────────────────── */}
      {openSession && (
        <SessionPanel
          session={openSession}
          subTeams={subTeams}
          users={users}
          canEdit={canEdit}
          busy={pending}
          onClose={() => setOpenSessionId(null)}
          onRetime={(start, end) => requestRetime(openSession.id, start, end)}
          onPark={() => guard(() => parkSession(openSession.id))}
          onDelete={() =>
            guard(async () => {
              const r = await deleteSession(openSession.id)
              if (!r.error) setOpenSessionId(null)
              return r
            })
          }
          onCue={(subTeamId, text) => guard(() => setCue(openSession.id, subTeamId, text))}
          onAddMember={(userId) => guard(() => addSessionMember({ sessionId: openSession.id, userId }))}
          onRemoveMember={(memberId) => guard(() => removeSessionMember(memberId))}
        />
      )}

      {/* ── Duplicate / save as template ─────────────────────── */}
      {copyMode && canEdit && (
        <CopySheetModal
          mode={copyMode}
          sourceTitle={sheet.title}
          busy={pending}
          onClose={() => setCopyMode(null)}
          onSubmit={(title) =>
            startTransition(async () => {
              const res =
                copyMode === "duplicate"
                  ? await duplicateRunSheet(sheet.id, title)
                  : await saveAsTemplate(sheet.id, title)

              if (res.error) return toast.error(res.error)
              setCopyMode(null)

              if (copyMode === "duplicate") {
                // Land the user in the copy — it's the thing they're about to edit.
                router.push(`/run-sheets/${res.id}`)
              } else {
                toast.success("Template saved")
              }
            })
          }
        />
      )}

      {/* ── Cascade confirm ──────────────────────────────────── */}
      {cascade && (
        <CascadeDialog
          plan={cascade.plan}
          busy={pending}
          onCancel={() => setCascade(null)}
          onConfirm={cascade.apply}
        />
      )}
    </>
  )
}

/* ────────────────────────────────────────────────────────────── */

function toLocalInput(d: Date) {
  // datetime-local wants "YYYY-MM-DDTHH:mm" in local time, which toISOString would shift.
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function CreateSessionModal({
  at,
  busy,
  onClose,
  onSubmit,
}: {
  at: Date
  busy: boolean
  onClose: () => void
  onSubmit: (v: { name: string; startTime: string; endTime: string; sessionType?: string }) => void
}) {
  const [name, setName] = useState("")
  const [start, setStart] = useState(toLocalInput(at))
  const [end, setEnd] = useState(toLocalInput(new Date(at.getTime() + 3_600_000)))

  const invalid = !name.trim() || new Date(end) <= new Date(start)

  return (
    <Modal
      open
      onClose={onClose}
      title="Add session"
      description="Only the name and times are required."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={invalid}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                startTime: new Date(start).toISOString(),
                endTime: new Date(end).toISOString(),
              })
            }
          >
            Add session
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Session name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Opening Prayer" autoFocus />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start" required>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </FormField>
          <FormField label="End" required>
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </FormField>
        </div>
        {new Date(end) <= new Date(start) && (
          <p className="text-[12px] text-danger">End time must be after start time.</p>
        )}
        <p className="text-[12px] text-muted">
          Cues for each unit are created automatically and can be filled in after.
        </p>
      </div>
    </Modal>
  )
}

/* ────────────────────────────────────────────────────────────── */

function CopySheetModal({
  mode,
  sourceTitle,
  busy,
  onClose,
  onSubmit,
}: {
  mode: "duplicate" | "template"
  sourceTitle: string
  busy: boolean
  onClose: () => void
  onSubmit: (title: string) => void
}) {
  const isTemplate = mode === "template"
  const [title, setTitle] = useState(
    isTemplate ? `${sourceTitle} template` : `${sourceTitle} (copy)`
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={isTemplate ? "Save as template" : "Duplicate run sheet"}
      description={
        isTemplate
          ? "Sessions, cues and members are saved for reuse. Pick a date when you start a sheet from it."
          : "Copies every session, cue and member assignment into a new sheet."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!title.trim()} onClick={() => onSubmit(title.trim())}>
            {isTemplate ? "Save template" : "Duplicate"}
          </Button>
        </>
      }
    >
      <FormField label="Name" required>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </FormField>
      <p className="mt-3 text-[12px] text-muted">
        Confirmations reset to pending — people re-confirm for the new date.
      </p>
    </Modal>
  )
}

/* ────────────────────────────────────────────────────────────── */

function SessionPanel({
  session,
  subTeams,
  users,
  canEdit,
  busy,
  onClose,
  onRetime,
  onPark,
  onDelete,
  onCue,
  onAddMember,
  onRemoveMember,
}: {
  session: SessionRow
  subTeams: { id: string; name: string }[]
  users: { id: string; full_name: string }[]
  canEdit: boolean
  busy: boolean
  onClose: () => void
  onRetime: (start: string, end: string) => void
  onPark: () => void
  onDelete: () => void
  onCue: (subTeamId: string, text: string) => void
  onAddMember: (userId: string) => void
  onRemoveMember: (memberId: string) => void
}) {
  const placedNow = isPlaced(session)
  const [start, setStart] = useState(
    placedNow ? toLocalInput(new Date(session.start_time!)) : ""
  )
  const [end, setEnd] = useState(placedNow ? toLocalInput(new Date(session.end_time!)) : "")
  const [addingMember, setAddingMember] = useState("")

  const timesChanged =
    start !== "" &&
    end !== "" &&
    (!placedNow ||
      new Date(start).toISOString() !== session.start_time ||
      new Date(end).toISOString() !== session.end_time)

  const timesValid = start !== "" && end !== "" && new Date(end) > new Date(start)

  const assignedIds = new Set(session.run_sheet_session_members.map((m) => m.user_id))
  const available = users.filter((u) => !assignedIds.has(u.id))

  return (
    <SidePanel open onClose={onClose} title={session.name}>
      <div className="space-y-6 p-5">
        {/* Times */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-muted">
            <Clock className="size-3.5" /> Timing
          </h3>
          {canEdit ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Start">
                  <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
                </FormField>
                <FormField label="End">
                  <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
                </FormField>
              </div>
              {timesChanged && timesValid && (
                <Button
                  size="sm"
                  loading={busy}
                  onClick={() =>
                    onRetime(new Date(start).toISOString(), new Date(end).toISOString())
                  }
                >
                  {placedNow ? "Update times" : "Place on timeline"}
                </Button>
              )}
              {start !== "" && end !== "" && !timesValid && (
                <p className="text-[12px] text-danger">End time must be after start time.</p>
              )}
            </>
          ) : (
            <p className="text-[13px] text-foreground">
              {placedNow
                ? `${format(new Date(session.start_time!), "h:mm a")} – ${format(new Date(session.end_time!), "h:mm a")}`
                : "Not yet scheduled"}
            </p>
          )}
        </section>

        {/* Cues — one per unit, collapsed into a simple list. */}
        <section className="space-y-3">
          <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted">Cues</h3>
          <div className="space-y-2.5">
            {subTeams.map((st) => {
              const cue = session.run_sheet_session_cues.find((c) => c.sub_team_id === st.id)
              return (
                <FormField key={st.id} label={st.name}>
                  {canEdit ? (
                    <Input
                      defaultValue={cue?.cue_text ?? ""}
                      placeholder="No cue"
                      onBlur={(e) => {
                        if (e.target.value !== (cue?.cue_text ?? "")) onCue(st.id, e.target.value)
                      }}
                    />
                  ) : (
                    <p className="text-[13px] text-foreground">{cue?.cue_text || "—"}</p>
                  )}
                </FormField>
              )
            })}
          </div>
        </section>

        {/* Members */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-muted">
            <Users className="size-3.5" /> Members
          </h3>

          {session.run_sheet_session_members.length === 0 ? (
            <EmptyState variant="compact" title="No one assigned" description="Add the people on this session." />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {session.run_sheet_session_members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 truncate text-[13px] text-foreground">
                    {m.users?.full_name ?? m.role_title ?? "Unassigned"}
                  </span>
                  <Badge variant="neutral">{m.confirmation_status}</Badge>
                  {canEdit && (
                    <IconButton size="xs" variant="ghost" label="Remove" onClick={() => onRemoveMember(m.id)}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && available.length > 0 && (
            <div className="flex gap-2">
              <Select
                value={addingMember}
                onChange={(v) => setAddingMember(v)}
                placeholder="Add member…"
                options={available.map((u) => ({ value: u.id, label: u.full_name }))}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!addingMember}
                loading={busy}
                onClick={() => {
                  onAddMember(addingMember)
                  setAddingMember("")
                }}
              >
                Add
              </Button>
            </div>
          )}
        </section>

        {canEdit && (
          <section className="flex gap-2 border-t border-border pt-4">
            {placedNow && (
              <Button size="sm" variant="outline" onClick={onPark}>
                <CornerUpLeft className="size-3.5" />
                Move to tray
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={onDelete}>
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </section>
        )}
      </div>
    </SidePanel>
  )
}

/* ────────────────────────────────────────────────────────────── */

/** Shows the blast radius of a retime before anything is written. */
function CascadeDialog({
  plan,
  busy,
  onCancel,
  onConfirm,
}: {
  plan: CascadePlan
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const crossings = plan.moves.filter((m) => m.crossesMidnight)

  return (
    <Modal
      open
      onClose={onCancel}
      title="This moves later sessions"
      description={`${plan.moves.length} session${plan.moves.length > 1 ? "s" : ""} will shift to make room.`}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button loading={busy} onClick={onConfirm}>Move them</Button>
        </>
      }
    >
      <ul className="divide-y divide-border rounded-md border border-border">
        {plan.moves.map((m) => (
          <li key={m.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
            <span className="flex-1 truncate text-foreground">{m.name}</span>
            <span className="text-muted tabular-nums">{format(new Date(m.fromStart), "h:mm a")}</span>
            <ArrowRight className="size-3.5 text-muted" />
            <span className="font-medium text-foreground tabular-nums">
              {format(new Date(m.toStart), "h:mm a")}
            </span>
          </li>
        ))}
      </ul>

      {crossings.length > 0 && (
        <p className="mt-3 text-[12px] text-warning">
          {crossings.length === 1
            ? `${crossings[0].name} will run past midnight.`
            : `${crossings.length} sessions will run past midnight.`}
        </p>
      )}
    </Modal>
  )
}
