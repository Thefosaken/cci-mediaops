"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import { DateInput } from "@/components/ui/date-input"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/form-field"
import { useToast } from "@/lib/toast/toast-context"
import { EVENT_TYPES } from "@/constants"
import { Calendar, MapPin, Plus, Users } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import type { Event, SubTeam } from "@/types"

// ── Helpers ─────────────────────────────────────────────────────────────────

function eventBadgeVariant(status: string) {
  switch (status) {
    case "confirmed": return "success" as const
    case "live":      return "info" as const
    case "completed": return "muted" as const
    case "cancelled": return "danger" as const
    default:          return "warning" as const
  }
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  sunday_service: "border-l-info",
  midweek_service: "border-l-success",
  worship_night: "border-l-primary",
  conference: "border-l-warning",
  training: "border-l-muted",
  rehearsal: "border-l-muted",
  outreach: "border-l-success",
  campus_event: "border-l-info",
  department_event: "border-l-warning",
  special_programme: "border-l-danger",
}

function groupByMonth(events: Event[]) {
  const map = new Map<string, Event[]>()
  for (const event of events) {
    const key = new Date(event.start_time).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    })
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(event)
  }
  return map
}

// ── Component ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: "",
  eventType: "sunday_service",
  description: "",
  location: "",
  startTime: "",
  endTime: "",
  requiredSubTeams: [] as string[],
}

export function CalendarPageClient({
  events,
  subTeams,
}: {
  events: Event[]
  subTeams: SubTeam[]
}) {
  const router = useRouter()
  const { success, error: showError } = useToast()

  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const subTeamOptions = subTeams.map((st) => ({ value: st.id, label: st.name }))
  const eventTypeOptions = EVENT_TYPES.map((t) => ({ value: t.value, label: t.label }))

  const openModal = useCallback(() => {
    setForm(EMPTY_FORM)
    setShowModal(true)
  }, [])

  const closeModal = useCallback(() => {
    setShowModal(false)
  }, [])

  async function createEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.startTime) return
    setLoading(true)

    try {
      const supabase = createClient()
      const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
      if (!campus) throw new Error("No campus found")

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

      if (error) throw new Error(error.message)

      if (event && form.requiredSubTeams.length > 0) {
        await supabase.from("event_sub_teams").insert(
          form.requiredSubTeams.map((st) => ({ event_id: event.id, sub_team_id: st }))
        )
      }

      closeModal()
      success("Event created successfully.")
      router.refresh()
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create event. Please try again.", {
        label: "Retry",
        onClick: () => (e.target as HTMLFormElement).requestSubmit?.(),
      })
    } finally {
      setLoading(false)
    }
  }

  const grouped = groupByMonth(events)

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Calendar</h1>
          <p className="text-sm text-muted mt-0.5">Services, events, rehearsals, and deadlines</p>
        </div>
        <Button onClick={openModal}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create Event
        </Button>
      </div>

      {/* Event list */}
      {events.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-6 w-6" />}
          title="No events yet"
          description="Create your first event to start managing your media schedule."
          action={{ label: "Create Event", onClick: openModal }}
        />
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([month, monthEvents]) => (
            <div key={month}>
              {/* Month divider */}
              <div className="flex items-center gap-3 mb-3">
                <p className="text-xs font-bold text-faint uppercase tracking-widest">{month}</p>
                <div className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>

              {/* Events in this month */}
              <div className="space-y-2">
                {monthEvents.map((event) => {
                  const start = new Date(event.start_time)
                  const typeColor = EVENT_TYPE_COLORS[event.event_type ?? ""] ?? "border-l-border"
                  const typeLabel = EVENT_TYPES.find((t) => t.value === event.event_type)?.label

                  return (
                    <div
                      key={event.id}
                      className={cn(
                        "flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-sm",
                        "border-l-[3px] transition-all duration-150 hover:shadow-md hover:border-border-strong",
                        typeColor
                      )}
                    >
                      {/* Date column */}
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-canvas border border-border leading-none">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-faint">
                          {start.toLocaleDateString("en-US", { month: "short" })}
                        </span>
                        <span className="text-base font-bold text-foreground leading-tight">
                          {start.getDate()}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{event.title}</p>
                          {typeLabel && (
                            <Badge variant="muted" className="text-[10px]">{typeLabel}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <p className="text-xs text-muted">
                            {start.toLocaleDateString("en-US", {
                              weekday: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          {event.location && (
                            <span className="flex items-center gap-1 text-xs text-faint">
                              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="truncate max-w-[200px]">{event.location}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status badge */}
                      <Badge variant={eventBadgeVariant(event.status ?? "")} dot>
                        {(event.status ?? "draft").replace(/_/g, " ")}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Event Modal */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title="New Event"
        description="Add a service, rehearsal, or event to the calendar."
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-event-form"
              loading={loading}
              disabled={loading}
            >
              Create Event
            </Button>
          </>
        }
      >
        <form id="create-event-form" onSubmit={createEvent} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Event title" required className="sm:col-span-2">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Sunday Morning Service"
                required
              />
            </FormField>

            <FormField label="Event type">
              <Select
                value={form.eventType}
                onChange={(v) => setForm({ ...form, eventType: v })}
                options={eventTypeOptions}
              />
            </FormField>

            <FormField label="Location" helper="Optional venue or room">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Main Auditorium"
              />
            </FormField>

            <FormField label="Start date & time" required>
              <DateInput
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                required
              />
            </FormField>

            <FormField label="End date & time" helper="Optional">
              <DateInput
                type="datetime-local"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Description" helper="Optional additional details">
            <textarea
              className={cn(
                "flex min-h-[80px] w-full rounded-lg border border-border bg-canvas px-3 py-2",
                "text-sm text-foreground placeholder:text-faint resize-none",
                "transition-colors duration-150 hover:border-border-strong",
                "focus-visible:outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-focus-ring/20"
              )}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What's happening at this event?"
            />
          </FormField>

          <FormField label="Required sub-teams" helper="Which teams need to be involved?">
            <Combobox
              values={form.requiredSubTeams}
              onChange={(v) => setForm({ ...form, requiredSubTeams: v })}
              options={subTeamOptions}
              placeholder="Select sub-teams…"
            />
          </FormField>
        </form>
      </Modal>
    </div>
  )
}
