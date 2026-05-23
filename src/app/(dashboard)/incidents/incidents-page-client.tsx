"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Incident {
  id: string
  incident_type: string
  severity: string
  description: string | null
  status: string
  resolution_notes: string | null
  events: { title: string } | null
  sub_teams: { name: string } | null
  users: { full_name: string } | null
  created_at: string
}

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
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    eventId: "",
    subTeamId: "",
    incidentType: "",
    severity: "medium",
    description: "",
  })

  async function submitIncident(e: React.FormEvent) {
    e.preventDefault()
    if (!form.description.trim()) return
    setLoading(true)
    const supabase = createClient()

    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("auth_user_id", authUser?.id)
      .single()

    const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()

    await supabase.from("incidents").insert({
      campus_id: campus?.id,
      event_id: form.eventId || null,
      sub_team_id: form.subTeamId || null,
      reported_by: user?.id,
      incident_type: form.incidentType || "other",
      severity: form.severity,
      description: form.description,
      status: "open",
    })

    setShowForm(false)
    setForm({ eventId: "", subTeamId: "", incidentType: "", severity: "medium", description: "" })
    setLoading(false)
    router.refresh()
  }

  async function resolve(id: string, notes: string) {
    const supabase = createClient()
    await supabase
      .from("incidents")
      .update({ status: "resolved", resolution_notes: notes })
      .eq("id", id)
    router.refresh()
  }

  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incidents</h1>
          <p className="text-sm text-muted-foreground">Capture and resolve operational issues</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Report Incident"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Report Incident</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submitIncident} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Incident Type</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.incidentType} onChange={(e) => setForm({ ...form, incidentType: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="sound_issue">Sound Issue</option>
                  <option value="projection_issue">Projection Issue</option>
                  <option value="livestream_issue">Livestream Issue</option>
                  <option value="camera_issue">Camera Issue</option>
                  <option value="lighting_issue">Lighting Issue</option>
                  <option value="late_member">Late Team Member</option>
                  <option value="missing_equipment">Missing Equipment</option>
                  <option value="faulty_equipment">Faulty Equipment</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Severity</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Related Event (optional)</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })}>
                  <option value="">None</option>
                  {events.map((ev) => (<option key={ev.id} value={ev.id}>{ev.title}</option>))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Related Sub-Team (optional)</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.subTeamId} onChange={(e) => setForm({ ...form, subTeamId: e.target.value })}>
                  <option value="">None</option>
                  {subTeams.map((st) => (<option key={st.id} value={st.id}>{st.name}</option>))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={loading}>Report Incident</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {incidents.map((inc) => (
          <Card key={inc.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base capitalize">{inc.incident_type.replace(/_/g, " ")}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {inc.users?.full_name} · {inc.sub_teams?.name} · {inc.events?.title}
                    · {new Date(inc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  inc.severity === "critical" ? "bg-red-100 text-red-800" :
                  inc.severity === "high" ? "bg-orange-100 text-orange-800" :
                  "bg-yellow-100 text-yellow-800"
                }`}>
                  {inc.severity}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{inc.description}</p>
              {inc.status === "open" && (
                <div className="mt-3 flex gap-2">
                  <input className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Resolution notes..." value={resolveNotes[inc.id] ?? ""} onChange={(e) => setResolveNotes((prev) => ({ ...prev, [inc.id]: e.target.value }))} />
                  <Button size="sm" onClick={() => resolve(inc.id, resolveNotes[inc.id] ?? "")}>Resolve</Button>
                </div>
              )}
              {inc.resolution_notes && (
                <p className="mt-2 text-sm text-muted-foreground">✅ {inc.resolution_notes}</p>
              )}
              <p className="mt-1 text-xs capitalize text-muted-foreground">Status: {inc.status}</p>
            </CardContent>
          </Card>
        ))}
        {incidents.length === 0 && (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">No incidents reported</div>
        )}
      </div>
    </div>
  )
}
