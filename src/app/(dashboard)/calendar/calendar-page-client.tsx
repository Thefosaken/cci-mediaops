"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EVENT_TYPES, EVENT_STATUSES } from "@/constants"
import type { Event, SubTeam } from "@/types"

export function CalendarPageClient({
  events,
  subTeams,
}: {
  events: Event[]
  subTeams: SubTeam[]
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    title: "",
    eventType: "sunday_service",
    description: "",
    location: "",
    startTime: "",
    endTime: "",
    requiredSubTeams: [] as string[],
  })

  async function createEvent(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()

    const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
    if (!campus) {
      setLoading(false)
      return
    }

    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("auth_user_id", authUser?.id)
      .single()

    const { data: event, error } = await supabase
      .from("events")
      .insert({
        campus_id: campus.id,
        title: form.title,
        event_type: form.eventType,
        description: form.description || null,
        location: form.location || null,
        start_time: form.startTime,
        end_time: form.endTime || null,
        status: "draft",
        created_by: user?.id,
      })
      .select()
      .single()

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    if (event && form.requiredSubTeams.length > 0) {
      const records = form.requiredSubTeams.map((st) => ({
        event_id: event.id,
        sub_team_id: st,
      }))
      await supabase.from("event_sub_teams").insert(records)
    }

    setShowForm(false)
    setForm({ title: "", eventType: "sunday_service", description: "", location: "", startTime: "", endTime: "", requiredSubTeams: [] })
    setLoading(false)
    router.refresh()
  }

  function toggleSubTeam(subTeamId: string) {
    setForm((prev) => ({
      ...prev,
      requiredSubTeams: prev.requiredSubTeams.includes(subTeamId)
        ? prev.requiredSubTeams.filter((id) => id !== subTeamId)
        : [...prev.requiredSubTeams, subTeamId],
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">Services, events, rehearsals, and deadlines</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Create Event"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New Event</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createEvent} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Event Title</Label>
                  <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eventType">Event Type</Label>
                  <select
                    id="eventType"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.eventType}
                    onChange={(e) => setForm({ ...form, eventType: e.target.value })}
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startTime">Start Date & Time</Label>
                  <Input id="startTime" type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endTime">End Date & Time (optional)</Label>
                  <Input id="endTime" type="datetime-local" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Required Sub-Teams</Label>
                <div className="flex flex-wrap gap-2">
                  {subTeams.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => toggleSubTeam(st.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        form.requiredSubTeams.includes(st.id)
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {st.name}
                    </button>
                  ))}
                </div>
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Event"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {events.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            No events yet. Create your first event to get started.
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{event.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {new Date(event.start_time).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {event.location && ` · ${event.location}`}
                  </p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  event.status === "confirmed" ? "bg-green-100 text-green-800" :
                  event.status === "live" ? "bg-blue-100 text-blue-800" :
                  event.status === "completed" ? "bg-gray-100 text-gray-800" :
                  event.status === "cancelled" ? "bg-red-100 text-red-800" :
                  "bg-yellow-100 text-yellow-800"
                }`}>
                  {event.status.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
