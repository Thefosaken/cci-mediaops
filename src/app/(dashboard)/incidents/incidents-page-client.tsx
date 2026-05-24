"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { useToast } from "@/lib/toast/toast-context"
import { AlertTriangle, Plus, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils/cn"

interface Incident {
  id: string
  incident_type: string
  severity: string
  description: string | null
  status: string
  resolution_notes: string | null
  events: { title: string } | null
  sub_teams: { name: string } | null
  reported_by: { full_name: string } | null
  created_at: string
}

function severityVariant(s: string) {
  switch (s) {
    case "critical": return "danger" as const
    case "high":     return "danger" as const
    case "medium":   return "warning" as const
    default:         return "muted" as const
  }
}

function statusVariant(s: string) {
  switch (s) {
    case "resolved":     return "success" as const
    case "investigating":return "info" as const
    default:             return "warning" as const
  }
}

const INCIDENT_TYPE_OPTIONS = [
  { value: "", label: "Select type…" },
  { value: "sound_issue",        label: "Sound Issue" },
  { value: "projection_issue",   label: "Projection Issue" },
  { value: "livestream_issue",   label: "Livestream Issue" },
  { value: "camera_issue",       label: "Camera Issue" },
  { value: "lighting_issue",     label: "Lighting Issue" },
  { value: "late_member",        label: "Late Team Member" },
  { value: "missing_equipment",  label: "Missing Equipment" },
  { value: "faulty_equipment",   label: "Faulty Equipment" },
  { value: "other",              label: "Other" },
]

const SEVERITY_OPTIONS = [
  { value: "low",      label: "Low" },
  { value: "medium",   label: "Medium" },
  { value: "high",     label: "High" },
  { value: "critical", label: "Critical" },
]

const EMPTY_FORM = { eventId: "", subTeamId: "", incidentType: "", severity: "medium", description: "" }

export function IncidentsPageClient({
  incidents,
  events,
  subTeams,
}: {
  incidents: Incident[]
  events: { id: string; title: string }[]
  subTeams: { id: string; name: string }[]
}) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({})
  const [resolving, setResolving] = useState<Record<string, boolean>>({})

  const eventOptions   = [{ value: "", label: "None" }, ...events.map((ev) => ({ value: ev.id, label: ev.title }))]
  const subTeamOptions = [{ value: "", label: "None" }, ...subTeams.map((st) => ({ value: st.id, label: st.name }))]

  async function submitIncident(e: React.FormEvent) {
    e.preventDefault()
    if (!form.description.trim()) return
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: user } = await supabase.from("users").select("id").eq("auth_user_id", authUser?.id).single()
      const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()

      const { error } = await supabase.from("incidents").insert({
        campus_id: campus?.id,
        event_id: form.eventId || null,
        sub_team_id: form.subTeamId || null,
        reported_by: user?.id,
        incident_type: form.incidentType || "other",
        severity: form.severity,
        description: form.description,
        status: "open",
      })
      if (error) throw error
      setShowModal(false)
      setForm(EMPTY_FORM)
      success("Incident reported.")
      router.refresh()
    } catch { showError("Failed to report incident.") }
    finally { setLoading(false) }
  }

  async function resolve(id: string) {
    setResolving((p) => ({ ...p, [id]: true }))
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("incidents")
        .update({ status: "resolved", resolution_notes: resolveNotes[id] ?? "" })
        .eq("id", id)
      if (error) throw error
      success("Incident resolved.")
      router.refresh()
    } catch { showError("Failed to resolve incident.") }
    finally { setResolving((p) => ({ ...p, [id]: false })) }
  }

  const open     = incidents.filter((i) => i.status !== "resolved")
  const resolved = incidents.filter((i) => i.status === "resolved")

  function IncidentCard({ inc }: { inc: Incident }) {
    const isOpen = inc.status !== "resolved"
    return (
      <div className="rounded-xl border border-border bg-surface p-5 hover:border-border-strong transition-colors duration-150">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground capitalize">{inc.incident_type.replace(/_/g, " ")}</p>
            <p className="text-xs text-muted mt-0.5 flex items-center flex-wrap gap-1">
              {inc.reported_by?.full_name && <span>{inc.reported_by.full_name}</span>}
              {inc.sub_teams?.name && <><span className="text-faint">·</span><span>{inc.sub_teams.name}</span></>}
              {inc.events?.title && <><span className="text-faint">·</span><span className="truncate max-w-[160px]">{inc.events.title}</span></>}
              <span className="text-faint">·</span>
              <span className="tabular-nums">{new Date(inc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant={severityVariant(inc.severity)} dot>{inc.severity}</Badge>
            <Badge variant={statusVariant(inc.status)} dot>{inc.status}</Badge>
          </div>
        </div>

        {/* Description */}
        {inc.description && <p className="text-sm text-muted mb-3">{inc.description}</p>}

        {/* Resolve action */}
        {isOpen && (
          <div className="flex gap-2 pt-3 border-t border-border">
            <Input
              className="flex-1"
              placeholder="Resolution notes…"
              value={resolveNotes[inc.id] ?? ""}
              onChange={(e) => setResolveNotes((p) => ({ ...p, [inc.id]: e.target.value }))}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => resolve(inc.id)}
              loading={resolving[inc.id]}
              disabled={resolving[inc.id]}
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
              Resolve
            </Button>
          </div>
        )}

        {/* Resolution notes */}
        {inc.resolution_notes && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-success flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {inc.resolution_notes}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Incidents</h1>
          <p className="text-sm text-muted mt-0.5">Capture and resolve operational issues</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" />
          Report Incident
        </Button>
      </div>

      {/* Open incidents */}
      {open.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-foreground">Open</p>
            <span className="inline-flex items-center rounded-md bg-warning-soft text-warning border border-warning/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
              {open.length}
            </span>
          </div>
          {open.map((inc) => <IncidentCard key={inc.id} inc={inc} />)}
        </div>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-foreground">Resolved</p>
            <span className="inline-flex items-center rounded-md bg-surface-subtle border border-border px-1.5 py-0.5 text-[10px] font-semibold text-faint tabular-nums">
              {resolved.length}
            </span>
          </div>
          {resolved.map((inc) => <IncidentCard key={inc.id} inc={inc} />)}
        </div>
      )}

      {/* Empty state */}
      {incidents.length === 0 && (
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5" />}
          title="No incidents"
          description="Any operational issues you report will appear here."
          action={{ label: "Report Incident", onClick: () => setShowModal(true) }}
        />
      )}

      {/* Report Incident Modal */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setForm(EMPTY_FORM) }}
        title="Report Incident"
        description="Log an operational issue so the team can track and resolve it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)} disabled={loading}>Cancel</Button>
            <Button type="submit" form="report-incident-form" loading={loading} disabled={loading}>Report</Button>
          </>
        }
      >
        <form id="report-incident-form" onSubmit={submitIncident} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Incident type">
            <Select value={form.incidentType} onChange={(v) => setForm({ ...form, incidentType: v })} options={INCIDENT_TYPE_OPTIONS} aria-label="Incident type" />
          </FormField>
          <FormField label="Severity">
            <Select value={form.severity} onChange={(v) => setForm({ ...form, severity: v })} options={SEVERITY_OPTIONS} aria-label="Severity" />
          </FormField>
          <FormField label="Related event" helper="Optional">
            <Select value={form.eventId} onChange={(v) => setForm({ ...form, eventId: v })} options={eventOptions} searchable={events.length > 6} aria-label="Related event" />
          </FormField>
          <FormField label="Related sub-team" helper="Optional">
            <Select value={form.subTeamId} onChange={(v) => setForm({ ...form, subTeamId: v })} options={subTeamOptions} aria-label="Related sub-team" />
          </FormField>
          <FormField label="Description" required className="sm:col-span-2">
            <textarea
              className="flex min-h-[80px] w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-foreground placeholder:text-faint resize-none transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-focus-ring/20"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe what happened…"
              required
            />
          </FormField>
        </form>
      </Modal>
    </div>
  )
}
