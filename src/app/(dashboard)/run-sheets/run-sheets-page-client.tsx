"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  ScrollText, Plus, Play, Square, ChevronLeft, ChevronRight,
  GripVertical, Trash2, ArrowUp, ArrowDown, X as XIcon,
  Projector, Volume2, Lightbulb, Camera, Share2,
  CheckCircle2, SkipForward, Circle,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/toast/toast-context"
import { useUrlState } from "@/lib/hooks/use-url-state"
import { cn } from "@/lib/utils/cn"

import { PageHeader } from "@/components/ui/page-header"
import { Toolbar, ToolbarGroup } from "@/components/ui/toolbar"
import { Button, IconButton } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/form-field"
import { Tooltip } from "@/components/ui/tooltip"

interface RunSheetSegment {
  id: string
  run_sheet_id: string
  title: string
  sequence_order: number
  segment_type: string
  planned_start_time: string | null
  estimated_duration_minutes: number | null
  owner_name: string | null
  projection_cue: string | null
  sound_cue: string | null
  lighting_cue: string | null
  camera_cue: string | null
  social_media_cue: string | null
  notes: string | null
  status: string
}

interface RunSheet {
  id: string
  title: string
  status: string
  events: { id: string; title: string; start_time: string } | null
  run_sheet_segments: RunSheetSegment[]
}

const CUE_FIELDS = [
  { key: "projection_cue", label: "Projection", Icon: Projector, color: "text-info" },
  { key: "sound_cue", label: "Sound", Icon: Volume2, color: "text-warning" },
  { key: "lighting_cue", label: "Lighting", Icon: Lightbulb, color: "text-primary" },
  { key: "camera_cue", label: "Camera", Icon: Camera, color: "text-success" },
  { key: "social_media_cue", label: "Social", Icon: Share2, color: "text-info" },
] as const

const SEGMENT_TYPES = [
  "prayer", "worship", "announcement", "offering",
  "sermon", "altar_call", "communion", "testimony",
  "video", "transition", "closing", "other",
]

const DEFAULT_SEGMENTS = [
  { title: "Welcome", type: "transition" },
  { title: "Opening Prayer", type: "prayer" },
  { title: "Praise & Worship", type: "worship" },
  { title: "Announcements", type: "announcement" },
  { title: "Offering", type: "offering" },
  { title: "Sermon", type: "sermon" },
  { title: "Altar Call", type: "altar_call" },
  { title: "Closing Charge", type: "closing" },
]

export function RunSheetsPageClient({
  runSheets,
  events,
}: {
  runSheets: RunSheet[]
  events: { id: string; title: string; start_time: string }[]
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const { get, set, clear } = useUrlState()

  const [activeSheetId, setActiveSheetId] = useState<string | null>(get("id"))
  const [showNew, setShowNew] = useState(get("new") === "1")
  const [liveMode, setLiveMode] = useState(false)
  const [currentSegmentIdx, setCurrentSegmentIdx] = useState(0)

  const [newSheet, setNewSheet] = useState({
    title: "",
    eventId: get("event") ?? "",
    seedDefaults: true,
  })
  const [creating, setCreating] = useState(false)

  // Sync URL `id` -> active sheet
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setActiveSheetId(get("id"))
  }, [get])

  const activeSheet = runSheets.find((rs) => rs.id === activeSheetId) ?? null

  async function handleCreate() {
    if (!newSheet.title.trim() || !newSheet.eventId) {
      toastError("Title and event are required")
      return
    }
    setCreating(true)
    try {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from("users").select("id").eq("auth_user_id", authUser?.id).single()
      const { data, error } = await supabase.from("run_sheets").insert({
        event_id: newSheet.eventId,
        title: newSheet.title,
        created_by: profile?.id,
        status: "draft",
      }).select().single()
      if (error) throw new Error(error.message)
      if (data && newSheet.seedDefaults) {
        await supabase.from("run_sheet_segments").insert(
          DEFAULT_SEGMENTS.map((s, i) => ({
            run_sheet_id: data.id,
            title: s.title,
            segment_type: s.type,
            sequence_order: i,
            status: "upcoming",
          }))
        )
      }
      setShowNew(false)
      clear("new")
      setNewSheet({ title: "", eventId: "", seedDefaults: true })
      success("Run sheet created", { label: "Open", onClick: () => set({ id: data!.id }) })
      router.refresh()
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to create run sheet")
    } finally { setCreating(false) }
  }

  async function updateCue(segmentId: string, field: string, value: string) {
    const supabase = createClient()
    await supabase.from("run_sheet_segments").update({ [field]: value }).eq("id", segmentId)
    router.refresh()
  }

  async function addSegment(sheetId: string, afterOrder: number) {
    const supabase = createClient()
    await supabase.from("run_sheet_segments").insert({
      run_sheet_id: sheetId,
      title: "New segment",
      segment_type: "other",
      sequence_order: afterOrder + 1,
      status: "upcoming",
    })
    router.refresh()
  }

  async function deleteSegment(segmentId: string) {
    const supabase = createClient()
    await supabase.from("run_sheet_segments").delete().eq("id", segmentId)
    success("Segment removed")
    router.refresh()
  }

  async function moveSegment(segments: RunSheetSegment[], idx: number, direction: -1 | 1) {
    const targetIdx = idx + direction
    if (targetIdx < 0 || targetIdx >= segments.length) return
    const a = segments[idx]
    const b = segments[targetIdx]
    const supabase = createClient()
    await Promise.all([
      supabase.from("run_sheet_segments").update({ sequence_order: b.sequence_order }).eq("id", a.id),
      supabase.from("run_sheet_segments").update({ sequence_order: a.sequence_order }).eq("id", b.id),
    ])
    router.refresh()
  }

  async function startLive() {
    if (!activeSheet) return
    const supabase = createClient()
    await supabase.from("run_sheets").update({ status: "live" }).eq("id", activeSheet.id)
    setLiveMode(true)
    setCurrentSegmentIdx(0)
    router.refresh()
  }

  async function endLive() {
    if (!activeSheet) return
    const supabase = createClient()
    await supabase.from("run_sheets").update({ status: "completed" }).eq("id", activeSheet.id)
    setLiveMode(false)
    success("Live mode ended")
    router.refresh()
  }

  async function markSegment(segmentId: string, status: string) {
    const supabase = createClient()
    await supabase.from("run_sheet_segments").update({ status }).eq("id", segmentId)
    router.refresh()
  }

  // ── LIVE MODE ──
  if (liveMode && activeSheet) {
    return <LiveMode
      sheet={activeSheet}
      currentIdx={currentSegmentIdx}
      onPrev={() => setCurrentSegmentIdx((i) => Math.max(0, i - 1))}
      onNext={(currentId) => {
        markSegment(currentId, "completed")
        setCurrentSegmentIdx((i) => Math.min(activeSheet.run_sheet_segments.length - 1, i + 1))
      }}
      onSkip={(currentId) => {
        markSegment(currentId, "skipped")
        setCurrentSegmentIdx((i) => Math.min(activeSheet.run_sheet_segments.length - 1, i + 1))
      }}
      onExit={endLive}
      onJump={setCurrentSegmentIdx}
    />
  }

  // ── EDITOR ──
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Run sheets"
        description="Build service flows and run them live"
        icon={<ScrollText />}
        actions={
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-3.5 w-3.5" /> New run sheet
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-0 flex-1 min-h-0">
        {/* List of sheets */}
        <aside className="border-r border-border bg-canvas overflow-y-auto">
          <div className="p-3 sticky top-0 bg-canvas/95 backdrop-blur border-b border-border z-10">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
              All run sheets
            </p>
          </div>
          {runSheets.length === 0 ? (
            <div className="p-5">
              <EmptyState
                variant="compact"
                icon={<ScrollText />}
                title="No run sheets yet"
                description="Create your first one to start planning service flow."
                action={{ label: "New run sheet", onClick: () => setShowNew(true) }}
              />
            </div>
          ) : (
            <ul className="p-2 space-y-0.5">
              {runSheets.map((rs) => (
                <li key={rs.id}>
                  <button
                    type="button"
                    onClick={() => set({ id: rs.id })}
                    className={cn(
                      "w-full text-left rounded-md px-2.5 py-2 transition-colors",
                      activeSheetId === rs.id
                        ? "bg-surface-subtle"
                        : "hover:bg-surface-subtle/60"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-foreground truncate flex-1">
                        {rs.title}
                      </span>
                      <StatusBadge status={rs.status} size="sm" />
                    </div>
                    <p className="text-[11.5px] text-muted truncate mt-0.5">
                      {rs.events?.title ?? "—"}
                      {rs.events?.start_time && (
                        <> · {format(new Date(rs.events.start_time), "MMM d")}</>
                      )}
                    </p>
                    <p className="text-[11px] text-faint tabular-nums mt-0.5">
                      {rs.run_sheet_segments.length} segments
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Editor */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {!activeSheet ? (
            <div className="h-full flex items-center justify-center p-8">
              <EmptyState
                icon={<ScrollText />}
                title="Pick a run sheet"
                description="Select a run sheet from the left to view and edit its segments and cues."
                action={runSheets.length === 0 ? { label: "Create one", onClick: () => setShowNew(true) } : undefined}
              />
            </div>
          ) : (
            <SheetEditor
              sheet={activeSheet}
              onUpdateCue={updateCue}
              onAddSegment={() => {
                const last = activeSheet.run_sheet_segments[activeSheet.run_sheet_segments.length - 1]
                addSegment(activeSheet.id, last?.sequence_order ?? -1)
              }}
              onDeleteSegment={deleteSegment}
              onMove={(idx, dir) => moveSegment(
                [...activeSheet.run_sheet_segments].sort((a, b) => a.sequence_order - b.sequence_order),
                idx,
                dir
              )}
              onUpdateTitle={async (segmentId, title) => {
                const supabase = createClient()
                await supabase.from("run_sheet_segments").update({ title }).eq("id", segmentId)
                router.refresh()
              }}
              onStartLive={startLive}
            />
          )}
        </main>
      </div>

      {/* New modal */}
      <Modal
        open={showNew}
        onClose={() => { setShowNew(false); clear("new") }}
        title="New run sheet"
        description="Build the flow for a service or event. You can seed with default service segments."
        size="default"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowNew(false); clear("new") }}>Cancel</Button>
            <Button onClick={handleCreate} loading={creating}>Create</Button>
          </>
        }
      >
        <div className="space-y-4 py-2">
          <FormField label="Title" required>
            <Input autoFocus value={newSheet.title}
              onChange={(e) => setNewSheet({ ...newSheet, title: e.target.value })}
              placeholder="e.g. Sunday Morning Service – Run Sheet" />
          </FormField>
          <FormField label="Event" required>
            <Select
              value={newSheet.eventId}
              onChange={(v) => setNewSheet({ ...newSheet, eventId: v })}
              options={[{ value: "", label: "Pick an event…" }, ...events.map((e) => ({
                value: e.id,
                label: e.title,
                description: format(new Date(e.start_time), "EEE, MMM d · h:mm a"),
              }))]}
              searchable={events.length > 6}
            />
          </FormField>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={newSheet.seedDefaults}
              onChange={(e) => setNewSheet({ ...newSheet, seedDefaults: e.target.checked })}
              className="h-4 w-4 rounded border-border-strong text-primary focus:ring-focus-ring/20"
            />
            <span className="text-[13px] text-foreground">Seed with default service segments (worship, sermon, etc.)</span>
          </label>
        </div>
      </Modal>
    </div>
  )
}

function SheetEditor({
  sheet,
  onUpdateCue,
  onAddSegment,
  onDeleteSegment,
  onMove,
  onUpdateTitle,
  onStartLive,
}: {
  sheet: RunSheet
  onUpdateCue: (segmentId: string, field: string, value: string) => void
  onAddSegment: () => void
  onDeleteSegment: (id: string) => void
  onMove: (idx: number, dir: -1 | 1) => void
  onUpdateTitle: (id: string, title: string) => void
  onStartLive: () => void
}) {
  const segments = [...sheet.run_sheet_segments].sort((a, b) => a.sequence_order - b.sequence_order)
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-canvas px-5 py-4 sticky top-0 z-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[16px] font-semibold text-foreground tracking-tight truncate">
              {sheet.title}
            </h2>
            <StatusBadge status={sheet.status} size="sm" />
          </div>
          <p className="text-[12px] text-muted mt-0.5 tabular-nums">
            {sheet.events?.title}
            {sheet.events?.start_time && ` · ${format(new Date(sheet.events.start_time), "EEE, MMM d · h:mm a")}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={onAddSegment}>
            <Plus className="h-3.5 w-3.5" /> Segment
          </Button>
          <Button size="sm" onClick={onStartLive} disabled={segments.length === 0}>
            <Play className="h-3.5 w-3.5" /> Start live
          </Button>
        </div>
      </div>

      <div className="px-5 py-5 space-y-2">
        {segments.length === 0 ? (
          <EmptyState
            icon={<ScrollText />}
            title="No segments yet"
            description="Add segments to build out the service flow."
            action={{ label: "Add segment", onClick: onAddSegment }}
          />
        ) : (
          segments.map((seg, idx) => (
            <SegmentRow
              key={seg.id}
              seg={seg}
              idx={idx}
              total={segments.length}
              onUpdateCue={(field, value) => onUpdateCue(seg.id, field, value)}
              onDelete={() => onDeleteSegment(seg.id)}
              onMoveUp={() => onMove(idx, -1)}
              onMoveDown={() => onMove(idx, 1)}
              onUpdateTitle={(title) => onUpdateTitle(seg.id, title)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function SegmentRow({
  seg, idx, total,
  onUpdateCue, onDelete, onMoveUp, onMoveDown, onUpdateTitle,
}: {
  seg: RunSheetSegment
  idx: number
  total: number
  onUpdateCue: (field: string, value: string) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onUpdateTitle: (title: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const filledCues = CUE_FIELDS.filter((c) => (seg as unknown as Record<string, string | null>)[c.key]).length

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-subtle border border-border text-[11px] font-semibold text-faint tabular-nums shrink-0">
          {idx + 1}
        </span>
        <Input
          value={seg.title}
          onChange={(e) => onUpdateTitle(e.target.value)}
          className="!h-7 !text-[13px] !border-transparent !bg-transparent hover:!border-border focus:!border-border-strong"
        />
        <Badge variant="muted" size="sm">{seg.segment_type.replace(/_/g, " ")}</Badge>
        {filledCues > 0 && (
          <Badge variant="info" size="sm">{filledCues} {filledCues === 1 ? "cue" : "cues"}</Badge>
        )}
        <div className="ml-auto flex items-center gap-0.5 shrink-0">
          <IconButton label="Move up" size="xs" onClick={onMoveUp} disabled={idx === 0}>
            <ArrowUp className="h-3 w-3" />
          </IconButton>
          <IconButton label="Move down" size="xs" onClick={onMoveDown} disabled={idx === total - 1}>
            <ArrowDown className="h-3 w-3" />
          </IconButton>
          <IconButton label="Delete segment" size="xs" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </IconButton>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="ml-1 text-[11.5px] font-medium text-muted hover:text-foreground transition-colors"
          >
            {expanded ? "Collapse" : "Edit cues"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-surface-subtle/30 px-3 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CUE_FIELDS.map(({ key, label, Icon, color }) => (
              <label key={key} className="block">
                <span className={cn("flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-1", color)}>
                  <Icon className="h-3 w-3" /> {label}
                </span>
                <Input
                  value={(seg as unknown as Record<string, string | null>)[key] ?? ""}
                  onChange={(e) => onUpdateCue(key, e.target.value)}
                  placeholder={`${label} cue…`}
                  className="!h-8 !text-[12.5px]"
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Live mode ───────────────────────────────────────────────────────────────
function LiveMode({
  sheet,
  currentIdx,
  onPrev,
  onNext,
  onSkip,
  onExit,
  onJump,
}: {
  sheet: RunSheet
  currentIdx: number
  onPrev: () => void
  onNext: (currentId: string) => void
  onSkip: (currentId: string) => void
  onExit: () => void
  onJump: (idx: number) => void
}) {
  const segments = useMemo(
    () => [...sheet.run_sheet_segments].sort((a, b) => a.sequence_order - b.sequence_order),
    [sheet]
  )
  const current = segments[currentIdx]
  const next = segments[currentIdx + 1]

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); current && onNext(current.id) }
      if (e.key === "ArrowLeft") { e.preventDefault(); onPrev() }
      if (e.key === "Escape") onExit()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [current, onNext, onPrev, onExit])

  if (!current) return null

  return (
    <div className="fixed inset-0 z-[60] bg-canvas flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-surface">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-2 w-2 rounded-full bg-danger animate-pulse" />
          <span className="text-[11.5px] font-semibold uppercase tracking-wider text-danger">
            Live
          </span>
          <span className="text-faint">·</span>
          <span className="text-[13px] font-medium text-foreground truncate">{sheet.title}</span>
          {sheet.events && (
            <>
              <span className="text-faint">·</span>
              <span className="text-[12px] text-muted truncate">{sheet.events.title}</span>
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
          {segments.map((s, i) => (
            <button
              key={s.id}
              onClick={() => onJump(i)}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-colors",
                i < currentIdx ? "bg-foreground/40" : i === currentIdx ? "bg-primary" : "bg-border"
              )}
              title={`${i + 1}. ${s.title}`}
            />
          ))}
        </div>
        <p className="text-[11px] text-faint mt-1.5 tabular-nums">
          {currentIdx + 1} of {segments.length}
        </p>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto px-5 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-faint mb-2">
              Current segment
            </p>
            <h1 className="text-[40px] font-semibold tracking-tight text-foreground leading-[1.05]">
              {current.title}
            </h1>
            <p className="text-[13px] text-muted mt-2">
              {current.segment_type.replace(/_/g, " ")}
              {current.owner_name && ` · ${current.owner_name}`}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CUE_FIELDS.map(({ key, label, Icon, color }) => {
              const value = (current as unknown as Record<string, string | null>)[key]
              return (
                <div key={key} className="rounded-lg border border-border bg-surface p-4">
                  <div className={cn("flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-1.5", color)}>
                    <Icon className="h-3 w-3" /> {label}
                  </div>
                  <p className={cn("text-[14px] leading-snug", value ? "text-foreground" : "text-faint italic")}>
                    {value ?? "No cue"}
                  </p>
                </div>
              )
            })}
          </div>

          {current.notes && (
            <div className="rounded-lg border border-border bg-surface-subtle/40 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-1.5">Notes</p>
              <p className="text-[14px] text-foreground leading-snug whitespace-pre-wrap">{current.notes}</p>
            </div>
          )}

          {next && (
            <div className="rounded-lg border border-dashed border-border bg-canvas p-4">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-faint mb-1">Up next</p>
              <p className="text-[16px] font-medium text-foreground">{next.title}</p>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <footer className="flex items-center justify-center gap-3 px-5 py-4 border-t border-border bg-surface">
        <Button variant="secondary" onClick={onPrev} disabled={currentIdx === 0}>
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </Button>
        <Button variant="ghost" onClick={() => onSkip(current.id)}>
          <SkipForward className="h-3.5 w-3.5" /> Skip
        </Button>
        <Button size="lg" onClick={() => onNext(current.id)}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Next segment
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </footer>
    </div>
  )
}
