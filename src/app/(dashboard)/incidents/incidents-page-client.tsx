"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format, formatDistanceToNow } from "date-fns"
import {
  AlertTriangle, Plus, Search, CheckCircle2, Activity,
  Clock, MessageSquare, PackageX, MapPin,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/toast/toast-context"
import { useUrlState } from "@/lib/hooks/use-url-state"
import { cn } from "@/lib/utils/cn"

import { PageHeader } from "@/components/ui/page-header"
import { Toolbar, ToolbarGroup } from "@/components/ui/toolbar"
import { Button } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/form-field"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SidePanel } from "@/components/ui/side-panel"
import { DataList, DataItem } from "@/components/ui/data-list"
import { Avatar } from "@/components/ui/avatar"
import { resolveIncident, updateIncidentStatus } from "@/server/actions/incidents"
import { markEquipmentFound } from "@/server/actions/equipment"

interface Incident {
  id: string
  incident_type: string
  severity: string
  description: string | null
  status: string
  resolution_notes: string | null
  events: { id: string; title: string; start_time: string } | null
  sub_teams: { id: string; name: string } | null
  reporter: { full_name: string | null; email: string | null } | null
  created_at: string
}

interface MissingItem {
  id: string
  name: string
  category: string | null
  asset_tag: string | null
  storage_location: string | null
  sub_team_id: string
  updated_at: string
  sub_teams: { id: string; name: string } | null
  current_custodian: { id: string; full_name: string | null; email: string | null } | null
}

const INCIDENT_TYPES = [
  { value: "sound_issue", label: "Sound" },
  { value: "projection_issue", label: "Projection" },
  { value: "livestream_issue", label: "Livestream" },
  { value: "camera_issue", label: "Camera" },
  { value: "lighting_issue", label: "Lighting" },
  { value: "late_member", label: "Late member" },
  { value: "missing_equipment", label: "Missing equipment" },
  { value: "faulty_equipment", label: "Faulty equipment" },
  { value: "schedule_conflict", label: "Schedule conflict" },
  { value: "other", label: "Other" },
]

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
]

const EMPTY_FORM = {
  eventId: "",
  subTeamId: "",
  incidentType: "sound_issue",
  severity: "medium",
  description: "",
}

export function IncidentsPageClient({
  incidents,
  events,
  subTeams,
  missingItems,
}: {
  incidents: Incident[]
  events: { id: string; title: string; start_time: string }[]
  subTeams: { id: string; name: string }[]
  missingItems: MissingItem[]
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const { get, set, clear } = useUrlState()

  const detailId = get("id")
  const showNew = get("new") === "1"

  const [tab, setTab] = useState<string>(get("tab") ?? "open")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [query, setQuery] = useState("")
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  // Optimistically hide items the user just marked found, so the row
  // disappears immediately instead of waiting on the server round-trip.
  const [foundIds, setFoundIds] = useState<Set<string>>(new Set())

  const isMissingTab = tab === "missing"

  // Open the report modal with a clean form.
  function openReport() {
    setForm(EMPTY_FORM)
    set({ new: "1" })
  }

  const detail = useMemo(() => incidents.find((i) => i.id === detailId) ?? null, [incidents, detailId])

  const visibleMissing = useMemo(
    () => missingItems.filter((m) => !foundIds.has(m.id)),
    [missingItems, foundIds]
  )

  const counts = useMemo(() => ({
    open: incidents.filter((i) => i.status !== "resolved").length,
    resolved: incidents.filter((i) => i.status === "resolved").length,
    critical: incidents.filter((i) => i.severity === "critical" && i.status !== "resolved").length,
    missing: visibleMissing.length,
  }), [incidents, visibleMissing])

  const filteredMissing = useMemo(() => {
    if (!query.trim()) return visibleMissing
    const q = query.toLowerCase()
    return visibleMissing.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      (m.asset_tag ?? "").toLowerCase().includes(q) ||
      (m.sub_teams?.name ?? "").toLowerCase().includes(q)
    )
  }, [visibleMissing, query])

  const filtered = useMemo(() => {
    let list = incidents
    if (tab === "open") list = list.filter((i) => i.status !== "resolved")
    if (tab === "resolved") list = list.filter((i) => i.status === "resolved")
    if (tab === "critical") list = list.filter((i) => i.severity === "critical")
    if (severityFilter !== "all") list = list.filter((i) => i.severity === severityFilter)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((i) =>
        i.incident_type.toLowerCase().includes(q) ||
        (i.description ?? "").toLowerCase().includes(q) ||
        (i.events?.title ?? "").toLowerCase().includes(q)
      )
    }
    return list
  }, [incidents, tab, severityFilter, query])

  async function handleReport() {
    if (!form.description.trim()) {
      toastError("Add a description")
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from("users").select("id").eq("auth_user_id", authUser?.id).single()
      const { data, error } = await supabase.from("incidents").insert({
        campus_id: campus?.id,
        event_id: form.eventId || null,
        sub_team_id: form.subTeamId || null,
        reported_by: profile?.id,
        incident_type: form.incidentType,
        severity: form.severity,
        description: form.description,
        status: "open",
      }).select().single()
      if (error) throw new Error(error.message)
      clear("new")
      success("Incident reported", { label: "Open", onClick: () => set({ id: data!.id }) })
      router.refresh()
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to report")
    } finally { setLoading(false) }
  }

  async function changeStatus(id: string, status: string, label: string) {
    const r = await updateIncidentStatus(id, status)
    if (r.error) toastError(r.error)
    else { success(label); router.refresh() }
  }

  async function resolve(id: string, notes: string) {
    if (!notes.trim()) { toastError("Add resolution notes"); return }
    const r = await resolveIncident(id, notes)
    if (r.error) toastError(r.error)
    else { success("Incident resolved"); router.refresh() }
  }

  async function markFound(id: string) {
    setFoundIds((prev) => new Set(prev).add(id))
    const r = await markEquipmentFound(id)
    if (r.error) {
      setFoundIds((prev) => { const next = new Set(prev); next.delete(id); return next })
      toastError(r.error)
    } else {
      success("Marked as found")
      router.refresh()
    }
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Incidents"
        description="Capture and resolve operational issues"
        icon={<AlertTriangle />}
        actions={
          <Button size="sm" onClick={openReport}>
            <Plus className="h-3.5 w-3.5" /> Report incident
          </Button>
        }
      />

      <div className="border-b border-border bg-canvas px-5 sm:px-6">
        <Tabs value={tab} onValueChange={(v) => { setTab(v); set({ tab: v === "open" ? null : v }) }}>
          <TabsList>
            <TabsTrigger value="open" badge={counts.open || undefined}>Open</TabsTrigger>
            <TabsTrigger value="critical" badge={counts.critical || undefined}>Critical</TabsTrigger>
            <TabsTrigger value="resolved" badge={counts.resolved || undefined}>Resolved</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="missing" badge={counts.missing || undefined}>Missing items</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Toolbar>
        <ToolbarGroup>
          <Input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={isMissingTab ? "Search missing items…" : "Search incidents…"}
            leadingIcon={<Search />}
            className="h-8 w-[260px]" />
          {!isMissingTab && (
            <Select value={severityFilter} onChange={setSeverityFilter}
              options={[{ value: "all", label: "All severities" }, ...SEVERITY_OPTIONS]}
              className="!w-[170px] [&>button]:h-8"
              aria-label="Severity filter" />
          )}
        </ToolbarGroup>
        <span className="text-[11.5px] text-faint tabular-nums">
          {isMissingTab ? filteredMissing.length : filtered.length}
        </span>
      </Toolbar>

      <div className="px-5 sm:px-6 py-6">
        {isMissingTab ? (
          filteredMissing.length === 0 ? (
            <EmptyState
              icon={<PackageX />}
              title={missingItems.length === 0 ? "No missing equipment" : "Nothing matches"}
              description={missingItems.length === 0
                ? "Items marked missing in Equipment show up here to be recovered or logged as incidents."
                : "Try clearing your search."}
            />
          ) : (
            <ul className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
              {filteredMissing.map((item) => (
                <li key={item.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-danger-soft border border-danger/20 text-danger shrink-0">
                      <PackageX className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-medium text-foreground">{item.name}</span>
                        {item.asset_tag && <Badge variant="muted" size="sm">{item.asset_tag}</Badge>}
                        {item.sub_teams?.name && <Badge variant="muted" size="sm">{item.sub_teams.name}</Badge>}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[12px] text-faint flex-wrap">
                        {item.current_custodian?.full_name && (
                          <span className="inline-flex items-center gap-1">
                            <Avatar name={item.current_custodian.full_name} size="xs" />
                            Last held by {item.current_custodian.full_name}
                          </span>
                        )}
                        {item.storage_location && (
                          <>
                            {item.current_custodian?.full_name && <span>·</span>}
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {item.storage_location}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="h-3 w-3" /> missing since {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Button variant="secondary" size="sm" onClick={() => markFound(item.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark found
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle />}
            title={incidents.length === 0 ? "No incidents" : "Nothing matches"}
            description={incidents.length === 0 ? "Any issues you report will appear here." : "Try clearing filters."}
            action={incidents.length === 0 ? { label: "Report incident", onClick: openReport } : undefined}
          />
        ) : (
          <ul className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
            {filtered.map((inc) => {
              const isOpen = inc.status !== "resolved"
              const typeLabel = INCIDENT_TYPES.find((t) => t.value === inc.incident_type)?.label ?? inc.incident_type.replace(/_/g, " ")
              return (
                <li key={inc.id}>
                  <button
                    type="button"
                    onClick={() => set({ id: inc.id })}
                    className="w-full text-left px-4 py-3 hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn(
                        "mt-1 inline-flex h-2 w-2 rounded-full shrink-0",
                        inc.severity === "critical" || inc.severity === "high" ? "bg-danger" :
                        inc.severity === "medium" ? "bg-warning" : "bg-muted"
                      )} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13.5px] font-medium text-foreground capitalize">
                            {typeLabel}
                          </span>
                          <Badge
                            variant={inc.severity === "critical" || inc.severity === "high" ? "danger" : inc.severity === "medium" ? "warning" : "muted"}
                            size="sm"
                          >
                            {inc.severity}
                          </Badge>
                          {inc.sub_teams?.name && (
                            <Badge variant="muted" size="sm">{inc.sub_teams.name}</Badge>
                          )}
                          {isOpen && inc.status === "investigating" && (
                            <Badge variant="info" size="sm" dot>Investigating</Badge>
                          )}
                        </div>
                        {inc.description && (
                          <p className="text-[12.5px] text-muted line-clamp-1 mt-1">{inc.description}</p>
                        )}
                        <div className="mt-1 flex items-center gap-2 text-[12px] text-faint flex-wrap">
                          {inc.reporter?.full_name && (
                            <span className="inline-flex items-center gap-1">
                              <Avatar name={inc.reporter.full_name} size="xs" />
                              {inc.reporter.full_name}
                            </span>
                          )}
                          {inc.events?.title && (
                            <>
                              <span>·</span>
                              <span className="truncate max-w-[200px]">{inc.events.title}</span>
                            </>
                          )}
                          <span>·</span>
                          <span className="tabular-nums">{formatDistanceToNow(new Date(inc.created_at), { addSuffix: true })}</span>
                        </div>
                      </div>
                      <StatusBadge status={inc.status} size="sm" />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Report modal */}
      <Modal
        open={showNew}
        onClose={() => clear("new")}
        title="Report incident"
        description="Log an operational issue so the team can track and resolve it."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => clear("new")} disabled={loading}>Cancel</Button>
            <Button onClick={handleReport} loading={loading} variant="danger">Report</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 py-2">
          <FormField label="Type" required>
            <Select value={form.incidentType} onChange={(v) => setForm({ ...form, incidentType: v })}
              options={INCIDENT_TYPES} />
          </FormField>
          <FormField label="Severity" required>
            <Select value={form.severity} onChange={(v) => setForm({ ...form, severity: v })}
              options={SEVERITY_OPTIONS} />
          </FormField>
          <FormField label="Related event">
            <Select value={form.eventId} onChange={(v) => setForm({ ...form, eventId: v })}
              options={[{ value: "", label: "No event" }, ...events.map((e) => ({ value: e.id, label: e.title }))]}
              searchable={events.length > 6} />
          </FormField>
          <FormField label="Related sub-team">
            <Select value={form.subTeamId} onChange={(v) => setForm({ ...form, subTeamId: v })}
              options={[{ value: "", label: "No sub-team" }, ...subTeams.map((s) => ({ value: s.id, label: s.name }))]} />
          </FormField>
          <FormField label="What happened?" required className="sm:col-span-2">
            <Textarea value={form.description} autoFocus
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe the issue, when it started, who's affected…" />
          </FormField>
        </div>
      </Modal>

      {/* Detail panel */}
      <SidePanel
        open={!!detail}
        onClose={() => clear("id")}
        title={detail ? (INCIDENT_TYPES.find((t) => t.value === detail.incident_type)?.label ?? detail.incident_type.replace(/_/g, " ")) : "Incident"}
        headerSlot={detail && (
          <>
            <Badge variant={detail.severity === "critical" || detail.severity === "high" ? "danger" : detail.severity === "medium" ? "warning" : "muted"} size="sm">
              {detail.severity}
            </Badge>
            <StatusBadge status={detail.status} size="sm" />
          </>
        )}
        size="lg"
        footer={detail && detail.status !== "resolved" && (
          <>
            {detail.status === "open" && (
              <Button variant="secondary" size="sm" onClick={() => changeStatus(detail.id, "investigating", "Marked investigating")}>
                <Activity className="h-3.5 w-3.5" /> Investigating
              </Button>
            )}
            <ResolveAction onResolve={(notes) => resolve(detail.id, notes)} />
          </>
        )}
      >
        {detail && <IncidentDetail incident={detail} />}
      </SidePanel>
    </div>
  )
}

function ResolveAction({ onResolve }: { onResolve: (notes: string) => void }) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState("")
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Resolve incident"
        description="Record what was done. This appears in incident history."
        size="default"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onResolve(notes); setOpen(false); setNotes("") }} disabled={!notes.trim()}>
              Mark resolved
            </Button>
          </>
        }
      >
        <FormField label="Resolution notes" required>
          <Textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="What was the fix?" />
        </FormField>
      </Modal>
    </>
  )
}

function IncidentDetail({ incident: inc }: { incident: Incident }) {
  return (
    <div className="space-y-5">
      <DataList>
        <DataItem label="Reported by">
          {inc.reporter ? (
            <div className="flex items-center gap-1.5">
              <Avatar name={inc.reporter.full_name} email={inc.reporter.email} size="xs" />
              {inc.reporter.full_name}
            </div>
          ) : null}
        </DataItem>
        <DataItem label="Event">{inc.events?.title}</DataItem>
        <DataItem label="Sub-team">{inc.sub_teams?.name}</DataItem>
        <DataItem label="Reported">
          <span className="tabular-nums">{format(new Date(inc.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
        </DataItem>
      </DataList>

      {inc.description && (
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint mb-1.5 flex items-center gap-1.5">
            <MessageSquare className="h-3 w-3" /> Description
          </p>
          <p className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">{inc.description}</p>
        </div>
      )}

      {inc.resolution_notes && (
        <div className="rounded-lg border border-success/30 bg-success-soft p-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-success mb-1.5 flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3" /> Resolution
          </p>
          <p className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">{inc.resolution_notes}</p>
        </div>
      )}
    </div>
  )
}
