"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FormField } from "@/components/ui/form-field"
import { useToast } from "@/lib/toast/toast-context"
import { CalendarCheck, Plus, UserCheck, User } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import type { Event, SubTeam } from "@/types"

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function confirmationBadgeVariant(status: string) {
  switch (status) {
    case "confirmed":          return "success" as const
    case "declined":           return "danger" as const
    case "replacement_needed": return "warning" as const
    default:                   return "muted" as const
  }
}

// User initials avatar (compact)
function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary text-[10px] font-bold ring-1 ring-border select-none"
      title={name}
      aria-label={`Assigned to ${name}`}
    >
      {initials}
    </div>
  )
}

// Sub-team color coding by index (cycle through palette)
const TEAM_COLORS = [
  "bg-info-soft text-info",
  "bg-success-soft text-success",
  "bg-warning-soft text-warning",
  "bg-primary-soft text-primary",
  "bg-danger-soft text-danger",
]

// ── Component ─────────────────────────────────────────────────────────────────

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
  const { success, error: showError } = useToast()

  const [selectedEvent, setSelectedEvent] = useState<string>(events[0]?.id ?? "")
  const [selectedSubTeam, setSelectedSubTeam] = useState<string>("")
  const [newRole, setNewRole] = useState("")
  const [addingSlot, setAddingSlot] = useState(false)
  const [newSlotSubTeam, setNewSlotSubTeam] = useState("")

  const eventOptions = events.map((ev) => ({
    value: ev.id,
    label: ev.title,
    description: new Date(ev.start_time).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    }),
  }))

  const subTeamFilterOptions = [
    { value: "", label: "All sub-teams" },
    ...subTeams.map((st) => ({ value: st.id, label: st.name })),
  ]

  const userOptions = [
    { value: "", label: "Unassigned" },
    ...users.map((u) => ({ value: u.id, label: u.full_name })),
  ]

  const confirmationOptions = [
    { value: "pending",           label: "Pending" },
    { value: "confirmed",         label: "Confirmed" },
    { value: "declined",          label: "Declined" },
    { value: "replacement_needed", label: "Replacement Needed" },
  ]

  const filteredSlots = slots.filter(
    (s) =>
      s.event_id === selectedEvent &&
      (!selectedSubTeam || s.sub_team_id === selectedSubTeam)
  )

  // Group slots by sub-team
  const groupedSlots = subTeams.reduce<Record<string, ScheduleSlot[]>>((acc, st) => {
    const teamSlots = filteredSlots.filter((s) => s.sub_team_id === st.id)
    if (teamSlots.length > 0) acc[st.id] = teamSlots
    return acc
  }, {})

  async function addSlot() {
    if (!selectedEvent || !newSlotSubTeam || !newRole.trim()) return
    setAddingSlot(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("schedule_slots").insert({
        event_id: selectedEvent,
        sub_team_id: newSlotSubTeam,
        role_title: newRole,
      })
      if (error) throw new Error(error.message)
      setNewRole("")
      success("Role slot added.")
      router.refresh()
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to add slot.")
    } finally {
      setAddingSlot(false)
    }
  }

  async function assignUser(slotId: string, userId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from("schedule_slots")
      .update({ assigned_user_id: userId || null })
      .eq("id", slotId)
    if (error) showError("Failed to assign user.")
    else router.refresh()
  }

  async function confirmSlot(slotId: string, status: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from("schedule_slots")
      .update({ confirmation_status: status })
      .eq("id", slotId)
    if (error) showError("Failed to update status.")
    else router.refresh()
  }

  const selectedEventObj = events.find((e) => e.id === selectedEvent)

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Scheduling</h1>
        <p className="text-sm text-muted mt-0.5">Assign people to service and event roles</p>
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap gap-3">
        <div className="w-full sm:w-72">
          <Select
            value={selectedEvent}
            onChange={setSelectedEvent}
            options={eventOptions}
            placeholder="Select an event…"
            searchable={events.length > 6}
            aria-label="Filter by event"
          />
        </div>
        <div className="w-full sm:w-52">
          <Select
            value={selectedSubTeam}
            onChange={setSelectedSubTeam}
            options={subTeamFilterOptions}
            aria-label="Filter by sub-team"
          />
        </div>
      </div>

      {/* Selected event label */}
      {selectedEventObj && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <CalendarCheck className="h-4 w-4 text-faint" aria-hidden="true" />
          <span className="font-medium text-foreground">{selectedEventObj.title}</span>
          <span className="text-faint">·</span>
          <span>
            {new Date(selectedEventObj.start_time).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>
      )}

      {/* Add role slot */}
      {selectedEvent && (
        <Card>
          <CardHeader>
            <CardTitle>Add role slot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="w-full sm:w-52 shrink-0">
                <Select
                  value={newSlotSubTeam}
                  onChange={setNewSlotSubTeam}
                  options={[
                    { value: "", label: "Sub-team…" },
                    ...subTeams.map((st) => ({ value: st.id, label: st.name })),
                  ]}
                  aria-label="Sub-team for new slot"
                />
              </div>
              <Input
                className="flex-1"
                placeholder="Role title (e.g. FOH Engineer, Lyrics Operator)"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addSlot() }
                }}
              />
              <Button
                onClick={addSlot}
                loading={addingSlot}
                disabled={addingSlot || !newSlotSubTeam || !newRole.trim()}
                className="shrink-0"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Slot
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Slot list */}
      {filteredSlots.length === 0 ? (
        <EmptyState
          icon={<UserCheck className="h-6 w-6" />}
          title="No schedule slots"
          description="Add a role slot above to start building the schedule for this event."
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedSlots).map(([subTeamId, teamSlots], teamIdx) => {
            const teamName = subTeams.find((st) => st.id === subTeamId)?.name ?? "Unknown"
            const teamColorClass = TEAM_COLORS[teamIdx % TEAM_COLORS.length]

            return (
              <div key={subTeamId}>
                {/* Sub-team section header */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      teamColorClass
                    )}
                  >
                    {teamName}
                  </span>
                  <div className="h-px flex-1 bg-border" aria-hidden="true" />
                  <span className="text-xs text-faint tabular-nums">
                    {teamSlots.length} {teamSlots.length === 1 ? "slot" : "slots"}
                  </span>
                </div>

                {/* Slot cards */}
                <div className="space-y-2">
                  {teamSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-sm hover:border-border-strong transition-colors duration-150"
                    >
                      {/* Role info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            slot.assigned_user ? "bg-surface-subtle" : "bg-canvas border border-dashed border-border-strong"
                          )}
                        >
                          {slot.assigned_user ? (
                            <UserAvatar name={slot.assigned_user.full_name} />
                          ) : (
                            <User className="h-4 w-4 text-faint" aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{slot.role_title}</p>
                          {slot.assigned_user && (
                            <p className="text-xs text-muted">{slot.assigned_user.full_name}</p>
                          )}
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Assign user */}
                        <div className="w-44">
                          <Select
                            value={slot.assigned_user_id ?? ""}
                            onChange={(v) => assignUser(slot.id, v)}
                            options={userOptions}
                            aria-label={`Assign user to ${slot.role_title}`}
                          />
                        </div>

                        {/* Confirmation status */}
                        <div className="w-48">
                          <Select
                            value={slot.confirmation_status}
                            onChange={(v) => confirmSlot(slot.id, v)}
                            options={confirmationOptions}
                            aria-label={`Confirmation status for ${slot.role_title}`}
                          />
                        </div>

                        {/* Status badge */}
                        <Badge
                          variant={confirmationBadgeVariant(slot.confirmation_status)}
                          dot
                          className="shrink-0 hidden sm:inline-flex"
                        >
                          {slot.confirmation_status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
