"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PRIORITIES, REQUEST_STATUSES } from "@/constants"
import type { Request, SubTeam, Event } from "@/types"

export function RequestsPageClient({
  requests,
  subTeams,
  events,
}: {
  requests: (Request & { request_sub_teams: { sub_team_id: string; sub_teams: { name: string } | null }[] })[]
  subTeams: SubTeam[]
  events: Event[]
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    title: "",
    requestingUnit: "",
    eventId: "",
    subTeamIds: [] as string[],
    description: "",
    desiredOutput: "",
    deadline: "",
    priority: "normal" as string,
    approvalRequired: false,
  })

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()

    const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
    if (!campus) { setLoading(false); return }

    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("auth_user_id", authUser?.id)
      .single()

    const { data: request, error } = await supabase
      .from("requests")
      .insert({
        campus_id: campus.id,
        event_id: form.eventId || null,
        title: form.title,
        requesting_unit: form.requestingUnit,
        requester_id: user?.id,
        description: form.description || null,
        desired_output: form.desiredOutput || null,
        deadline: form.deadline || null,
        priority: form.priority,
        status: "submitted",
        approval_required: form.approvalRequired,
      })
      .select()
      .single()

    if (error) { alert(error.message); setLoading(false); return }

    if (request && form.subTeamIds.length > 0) {
      const records = form.subTeamIds.map((st) => ({
        request_id: request.id,
        sub_team_id: st,
      }))
      await supabase.from("request_sub_teams").insert(records)
    }

    setShowForm(false)
    setForm({ title: "", requestingUnit: "", eventId: "", subTeamIds: [], description: "", desiredOutput: "", deadline: "", priority: "normal", approvalRequired: false })
    setLoading(false)
    router.refresh()
  }

  function toggleSubTeam(id: string) {
    setForm((prev) => ({
      ...prev,
      subTeamIds: prev.subTeamIds.includes(id)
        ? prev.subTeamIds.filter((s) => s !== id)
        : [...prev.subTeamIds, id],
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Requests</h1>
          <p className="text-sm text-muted">Submit, route, and manage media requests</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "New Request"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Submit Media Request</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submitRequest} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reqTitle">Request Title</Label>
                  <Input id="reqTitle" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reqUnit">Requesting Unit</Label>
                  <Input id="reqUnit" value={form.requestingUnit} onChange={(e) => setForm({ ...form, requestingUnit: e.target.value })} placeholder="e.g. Teens Church, Choir" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reqEvent">Link to Event (optional)</Label>
                  <select
                    id="reqEvent"
                    className="flex h-9 w-full rounded-md border border bg-canvas px-3 py-2 text-sm"
                    value={form.eventId}
                    onChange={(e) => setForm({ ...form, eventId: e.target.value })}
                  >
                    <option value="">No event linked</option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>{ev.title}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reqPriority">Priority</Label>
                  <select
                    id="reqPriority"
                    className="flex h-9 w-full rounded-md border border bg-canvas px-3 py-2 text-sm"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reqDeadline">Deadline (optional)</Label>
                  <Input id="reqDeadline" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Route to Sub-Teams</Label>
                <div className="flex flex-wrap gap-2">
                  {subTeams.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => toggleSubTeam(st.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        form.subTeamIds.includes(st.id)
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {st.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reqDesc">Description</Label>
                <textarea
                  id="reqDesc"
                  className="flex min-h-[80px] w-full rounded-md border border bg-canvas px-3 py-2 text-sm"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reqOutput">Desired Output</Label>
                <textarea
                  id="reqOutput"
                  className="flex min-h-[60px] w-full rounded-md border border bg-canvas px-3 py-2 text-sm"
                  value={form.desiredOutput}
                  onChange={(e) => setForm({ ...form, desiredOutput: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.approvalRequired} onChange={(e) => setForm({ ...form, approvalRequired: e.target.checked })} className="rounded" />
                <span className="text-sm">Approval required</span>
              </label>
              <Button type="submit" disabled={loading}>
                {loading ? "Submitting..." : "Submit Request"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {requests.length === 0 ? (
          <div className="rounded-lg border bg-surface p-8 text-center text-muted">
            No requests yet.
          </div>
        ) : (
          requests.map((req) => (
            <div key={req.id} className="rounded-lg border bg-surface p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="font-semibold">{req.title}</h3>
                  <p className="text-sm text-muted">
                    {req.requesting_unit} · {req.priority} priority
                  </p>
                  {req.request_sub_teams.length > 0 && (
                    <div className="flex gap-1">
                      {req.request_sub_teams.map((rst) => (
                        <span key={rst.sub_team_id} className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs">
                          {rst.sub_teams?.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  req.status === "completed" ? "bg-green-100 text-green-800" :
                  req.status === "rejected" || req.status === "cancelled" ? "bg-red-100 text-red-800" :
                  req.status === "in_progress" ? "bg-blue-100 text-blue-800" :
                  "bg-yellow-100 text-yellow-800"
                }`}>
                  {req.status.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
