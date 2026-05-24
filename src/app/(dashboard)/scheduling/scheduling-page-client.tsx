"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  CalendarCheck, Plus, UserPlus, User as UserIcon, Trash2, Clock,
  CheckCircle2, XCircle, RotateCcw, Send,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/toast/toast-context"
import { useUrlState } from "@/lib/hooks/use-url-state"
import { cn } from "@/lib/utils/cn"
import { EVENT_TYPES } from "@/constants"

import { PageHeader } from "@/components/ui/page-header"
import { Toolbar, ToolbarGroup } from "@/components/ui/toolbar"
import { Button, IconButton } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Modal } from "@/components/ui/modal"
import { FormField } from "@/components/ui/form-field"
import { DateInput } from "@/components/ui/date-input"
import { Avatar } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import { Tooltip } from "@/components/ui/tooltip"

interface EventLite {
  id: string
  title: string
  start_time: string
  end_time: string | null
  status: string | null
  location: string | null
  event_type: string | null
}

interface ScheduleSlot {
  id: string
  event_id: string
  sub_team_id: string
  role_title: string
  assigned_user_id: string | null
  call_time: string | null
  start_time: string | null
  confirmation_status: string
  attendance_status: string | null
  notes: string | null
  assigned_user: { id: string; full_name: string | null; email: string | null } | null
}

interface UserLite { id: string; full_name: string | null; email: string | null }
interface SubTeamLite { id: string; name: string }

export function SchedulingPageClient({
  events,
  subTeams,
  users,
  slots,
}: {
  events: EventLite[]
  subTeams: SubTeamLite[]
  users: UserLite[]
  slots: ScheduleSlot[]
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const { get, set } = useUrlState()

  const initialEvent = get("event") ?? events[0]?.id ?? ""
  const [selectedEvent, setSelectedEvent] = useState<string>(initialEvent)
  const [subTeamFilter, setSubTeamFilter] = useState<string>("all")
  const [showNew, setShowNew] = useState(get("new") === "1")
  const [newSlot, setNewSlot] = useState({ subTeamId: "", roleTitle: "", callTime: "" })
  const [saving, setSaving] = useState(false)

  // Reflect the chosen event into the URL so deep-links work.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { set({ event: selectedEvent }) }, [selectedEvent, set])

  const selectedEventObj = events.find((e) => e.id === selectedEvent) ?? null

  const filteredSlots = useMemo(
    () =>
      slots.filter(
        (s) =>
          s.event_id === selectedEvent &&
          (subTeamFilter === "all" || s.sub_team_id === subTeamFilter)
      ),
    [slots, selectedEvent, subTeamFilter]
  )

  const grouped = useMemo(() => {
    const map = new Map<string, ScheduleSlot[]>()
    subTeams.forEach((st) => {
      const teamSlots = filteredSlots.filter((s) => s.sub_team_id === st.id)
      if (teamSlots.length > 0) map.set(st.id, teamSlots)
    })
    return map
  }, [filteredSlots, subTeams])

  const summary = useMemo(() => {
    const total = filteredSlots.length
    const filled = filteredSlots.filter((s) => s.assigned_user_id).length
    const confirmed = filteredSlots.filter((s) => s.confirmation_status === "confirmed").length
    const declined = filteredSlots.filter((s) => s.confirmation_status === "declined").length
    return { total, filled, confirmed, declined }
  }, [filteredSlots])

  async function addSlot() {
    if (!selectedEvent || !newSlot.subTeamId || !newSlot.roleTitle.trim()) return
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("schedule_slots").insert({
        event_id: selectedEvent,
        sub_team_id: newSlot.subTeamId,
        role_title: newSlot.roleTitle,
        call_time: newSlot.callTime || null,
      })
      if (error) throw new Error(error.message)
      setNewSlot({ subTeamId: "", roleTitle: "", callTime: "" })
      setShowNew(false)
      success("Role slot added")
      router.refresh()
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to add slot")
    } finally { setSaving(false) }
  }

  async function assignUser(slotId: string, userId: string | null) {
    const supabase = createClient()
    const { error } = await supabase
      .from("schedule_slots")
      .update({ assigned_user_id: userId, confirmation_status: userId ? "pending" : "pending" })
      .eq("id", slotId)
    if (error) toastError(error.message)
    else { success(userId ? "Assignment updated" : "Slot cleared"); router.refresh() }
  }

  async function setConfirmation(slotId: string, status: string, label: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from("schedule_slots")
      .update({ confirmation_status: status })
      .eq("id", slotId)
    if (error) toastError(error.message)
    else { success(label); router.refresh() }
  }

  async function deleteSlot(slotId: string) {
    const supabase = createClient()
    const { error } = await supabase.from("schedule_slots").delete().eq("id", slotId)
    if (error) toastError(error.message)
    else { success("Slot removed"); router.refresh() }
  }

  async function sendReminders() {
    if (!selectedEventObj) return
    const pending = filteredSlots.filter(
      (s) => s.assigned_user_id && s.confirmation_status === "pending"
    )
    if (pending.length === 0) {
      toastError("Nothing pending to remind")
      return
    }
    const supabase = createClient()
    const rows = pending.map((s) => ({
      user_id: s.assigned_user_id!,
      type: "confirmation_required",
      title: `Confirm: ${s.role_title}`,
      body: `You're scheduled for ${selectedEventObj.title}. Please confirm.`,
      entity_type: "event",
      entity_id: selectedEventObj.id,
    }))
    const { error } = await supabase.from("notifications").insert(rows)
    if (error) toastError(error.message)
    else success(`Reminder sent to ${pending.length} ${pending.length === 1 ? "person" : "people"}`)
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Scheduling"
        description="Assign people to service and event roles"
        icon={<CalendarCheck />}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={sendReminders} disabled={!selectedEvent}>
              <Send className="h-3.5 w-3.5" /> Send reminders
            </Button>
            <Button size="sm" onClick={() => setShowNew(true)} disabled={!selectedEvent}>
              <Plus className="h-3.5 w-3.5" /> Add slot
            </Button>
          </>
        }
      />

      <Toolbar>
        <ToolbarGroup>
          <Select
            value={selectedEvent}
            onChange={setSelectedEvent}
            options={events.map((ev) => ({
              value: ev.id,
              label: ev.title,
              description: format(new Date(ev.start_time), "EEE, MMM d · h:mm a"),
            }))}
            searchable={events.length > 6}
            placeholder="Select event…"
            className="!w-[300px] [&>button]:h-8"
            aria-label="Event"
          />
          <Select
            value={subTeamFilter}
            onChange={setSubTeamFilter}
            options={[{ value: "all", label: "All sub-teams" }, ...subTeams.map((s) => ({ value: s.id, label: s.name }))]}
            className="!w-[180px] [&>button]:h-8"
            aria-label="Sub-team filter"
          />
        </ToolbarGroup>
        {selectedEventObj && (
          <div className="flex items-center gap-3 text-[12px]">
            <Metric label="Slots" value={summary.total} />
            <Metric label="Filled" value={`${summary.filled}/${summary.total}`} tone="default" />
            <Metric label="Confirmed" value={summary.confirmed} tone="success" />
            {summary.declined > 0 && <Metric label="Declined" value={summary.declined} tone="danger" />}
          </div>
        )}
      </Toolbar>

      <div className="px-5 sm:px-6 py-6 space-y-6">
        {!selectedEventObj ? (
          <EmptyState
            icon={<CalendarCheck />}
            title="No upcoming events"
            description="Create an event before assigning roles."
            action={{ label: "New event", href: "/calendar?new=1" }}
          />
        ) : (
          <>
            {/* Event header card */}
            <div className="rounded-xl border border-border bg-surface px-5 py-4 flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-surface-subtle border border-border leading-none">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-faint">
                  {format(new Date(selectedEventObj.start_time), "MMM")}
                </span>
                <span className="text-[15px] font-semibold tabular-nums">
                  {format(new Date(selectedEventObj.start_time), "d")}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[14px] font-semibold text-foreground truncate">
                    {selectedEventObj.title}
                  </h2>
                  <StatusBadge status={selectedEventObj.status ?? "draft"} size="sm" />
                </div>
                <p className="text-[12px] text-muted tabular-nums mt-0.5">
                  {format(new Date(selectedEventObj.start_time), "EEEE, MMMM d · h:mm a")}
                  {selectedEventObj.location && ` · ${selectedEventObj.location}`}
                  {selectedEventObj.event_type && (
                    <> · {EVENT_TYPES.find((t) => t.value === selectedEventObj.event_type)?.label}</>
                  )}
                </p>
              </div>
            </div>

            {filteredSlots.length === 0 ? (
              <EmptyState
                icon={<UserPlus />}
                title="No schedule slots yet"
                description="Add role slots for this event and start assigning serving members."
                action={{ label: "Add slot", onClick: () => setShowNew(true) }}
              />
            ) : (
              <div className="space-y-5">
                {Array.from(grouped.entries()).map(([subTeamId, teamSlots]) => {
                  const team = subTeams.find((s) => s.id === subTeamId)
                  const unfilled = teamSlots.filter((s) => !s.assigned_user_id).length
                  return (
                    <div key={subTeamId}>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-faint">
                            {team?.name ?? "Unknown"}
                          </h3>
                          {unfilled > 0 && (
                            <Badge variant="warning" size="sm">{unfilled} unfilled</Badge>
                          )}
                        </div>
                        <div className="h-px flex-1 bg-border" aria-hidden="true" />
                        <span className="text-[11px] text-faint tabular-nums">
                          {teamSlots.length}
                        </span>
                      </div>

                      <div className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
                        {teamSlots.map((slot) => (
                          <SlotRow
                            key={slot.id}
                            slot={slot}
                            users={users}
                            onAssign={(uid) => assignUser(slot.id, uid)}
                            onConfirm={(status, label) => setConfirmation(slot.id, status, label)}
                            onDelete={() => deleteSlot(slot.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add slot modal */}
      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="Add schedule slot"
        description="Create a role for this event. You can assign someone now or later."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowNew(false)} disabled={saving}>Cancel</Button>
            <Button onClick={addSlot} loading={saving}
              disabled={saving || !newSlot.subTeamId || !newSlot.roleTitle.trim()}>
              Add slot
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-2">
          <FormField label="Sub-team" required>
            <Select
              value={newSlot.subTeamId}
              onChange={(v) => setNewSlot({ ...newSlot, subTeamId: v })}
              options={[{ value: "", label: "Choose sub-team…" }, ...subTeams.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </FormField>
          <FormField label="Role title" required>
            <Input value={newSlot.roleTitle} autoFocus
              onChange={(e) => setNewSlot({ ...newSlot, roleTitle: e.target.value })}
              placeholder="e.g. FOH Engineer" />
          </FormField>
          <FormField label="Call time" helper="Optional — when should they arrive?">
            <DateInput type="datetime-local" value={newSlot.callTime}
              onChange={(e) => setNewSlot({ ...newSlot, callTime: e.target.value })} />
          </FormField>
        </div>
      </Modal>
    </div>
  )
}

function Metric({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "success" | "danger" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <span className="text-faint">{label}</span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "default" && "text-foreground"
        )}
      >
        {value}
      </span>
    </span>
  )
}

function SlotRow({
  slot,
  users,
  onAssign,
  onConfirm,
  onDelete,
}: {
  slot: ScheduleSlot
  users: UserLite[]
  onAssign: (userId: string | null) => void
  onConfirm: (status: string, label: string) => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover/40 transition-colors">
      <Avatar
        name={slot.assigned_user?.full_name}
        email={slot.assigned_user?.email}
        size="sm"
        className={slot.assigned_user ? "" : "opacity-30"}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-foreground">{slot.role_title}</span>
          {slot.call_time && (
            <span className="inline-flex items-center gap-1 text-[11px] text-faint tabular-nums">
              <Clock className="h-2.5 w-2.5" /> {format(new Date(slot.call_time), "h:mm a")}
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted mt-0.5">
          {slot.assigned_user?.full_name ?? <span className="italic text-faint">Unassigned</span>}
        </p>
      </div>

      <div className="hidden sm:block w-[200px]">
        <Select
          value={slot.assigned_user_id ?? ""}
          onChange={(v) => onAssign(v || null)}
          options={[{ value: "", label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: u.full_name ?? u.email ?? "—" }))]}
          searchable={users.length > 8}
          aria-label="Assign user"
          className="[&>button]:h-7 [&>button]:text-[12px]"
        />
      </div>

      <StatusBadge status={slot.confirmation_status} size="sm" />

      <DropdownMenu
        trigger={
          <IconButton label="Slot actions" size="xs" variant="ghost">
            <span className="text-[13px]">⋯</span>
          </IconButton>
        }
      >
        <DropdownMenuLabel>Confirmation</DropdownMenuLabel>
        <DropdownMenuItem icon={<CheckCircle2 />} onSelect={() => onConfirm("confirmed", "Confirmed")}>
          Confirm
        </DropdownMenuItem>
        <DropdownMenuItem icon={<XCircle />} onSelect={() => onConfirm("declined", "Declined")}>
          Decline
        </DropdownMenuItem>
        <DropdownMenuItem icon={<RotateCcw />} onSelect={() => onConfirm("replacement_needed", "Marked for replacement")}>
          Replacement needed
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onConfirm("pending", "Reset to pending")}>
          Reset to pending
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Trash2 />} variant="danger" onSelect={onDelete}>
          Remove slot
        </DropdownMenuItem>
      </DropdownMenu>
    </div>
  )
}
