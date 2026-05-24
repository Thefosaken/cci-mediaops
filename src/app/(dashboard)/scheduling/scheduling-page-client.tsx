"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Event, SubTeam } from "@/types"

interface ScheduleSlot {
  id: string
  event_id: string
  sub_team_id: string
  role_title: string
  assigned_user_id: string | null
  call_time: string | null
  confirmation_status: string
  attendance_status: string | null
  assigned_user: { full_name: string } | null
}

export function SchedulingPageClient({
  events,
  subTeams,
  users,
  slots,
}: {
  events: Event[]
  subTeams: { id: string; name: string }[]
  users: { id: string; full_name: string }[]
  slots: ScheduleSlot[]
}) {
  const router = useRouter()
  const [selectedEvent, setSelectedEvent] = useState<string>(events[0]?.id ?? "")
  const [selectedSubTeam, setSelectedSubTeam] = useState<string>("")
  const [newRole, setNewRole] = useState("")

  const filteredSlots = slots.filter(
    (s) => s.event_id === selectedEvent && (!selectedSubTeam || s.sub_team_id === selectedSubTeam)
  )

  async function addSlot() {
    if (!selectedEvent || !selectedSubTeam || !newRole.trim()) return
    const supabase = createClient()

    await supabase.from("schedule_slots").insert({
      event_id: selectedEvent,
      sub_team_id: selectedSubTeam,
      role_title: newRole,
    })

    setNewRole("")
    router.refresh()
  }

  async function assignUser(slotId: string, userId: string) {
    const supabase = createClient()
    await supabase.from("schedule_slots").update({ assigned_user_id: userId || null }).eq("id", slotId)
    router.refresh()
  }

  async function confirmSlot(slotId: string, status: string) {
    const supabase = createClient()
    await supabase.from("schedule_slots").update({ confirmation_status: status }).eq("id", slotId)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Scheduling</h1>
        <p className="text-sm text-muted">Assign people to service and event roles</p>
      </div>

      <div className="flex gap-4 flex-wrap">
        <select
          className="rounded-md border border bg-canvas px-3 py-2 text-sm"
          value={selectedEvent}
          onChange={(e) => setSelectedEvent(e.target.value)}
        >
          <option value="">Select event...</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title} — {new Date(ev.start_time).toLocaleDateString()}
            </option>
          ))}
        </select>

        <select
          className="rounded-md border border bg-canvas px-3 py-2 text-sm"
          value={selectedSubTeam}
          onChange={(e) => setSelectedSubTeam(e.target.value)}
        >
          <option value="">All sub-teams</option>
          {subTeams.map((st) => (
            <option key={st.id} value={st.id}>{st.name}</option>
          ))}
        </select>
      </div>

      {selectedEvent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add Role Slot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <select
                className="rounded-md border border bg-canvas px-3 py-2 text-sm"
                value={selectedSubTeam}
                onChange={(e) => setSelectedSubTeam(e.target.value)}
              >
                <option value="">Sub-team...</option>
                {subTeams.map((st) => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
              <input
                className="flex-1 rounded-md border border bg-canvas px-3 py-2 text-sm"
                placeholder="Role (e.g. FOH Engineer, Lyrics Operator)"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
              />
              <Button onClick={addSlot}>Add Slot</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {filteredSlots.length === 0 ? (
          <div className="rounded-lg border bg-surface p-8 text-center text-muted">
            No schedule slots. Add a role slot above.
          </div>
        ) : (
          filteredSlots.map((slot) => (
            <div key={slot.id} className="rounded-lg border bg-surface p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{slot.role_title}</p>
                  <p className="text-sm text-muted">
                    {subTeams.find((st) => st.id === slot.sub_team_id)?.name}
                    {slot.assigned_user && ` · ${slot.assigned_user.full_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    className="rounded-md border border bg-canvas px-2 py-1 text-xs"
                    value={slot.assigned_user_id ?? ""}
                    onChange={(e) => assignUser(slot.id, e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                  <select
                    className="rounded-md border border bg-canvas px-2 py-1 text-xs"
                    value={slot.confirmation_status}
                    onChange={(e) => confirmSlot(slot.id, e.target.value)}
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="declined">Declined</option>
                    <option value="replacement_needed">Replacement Needed</option>
                  </select>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
