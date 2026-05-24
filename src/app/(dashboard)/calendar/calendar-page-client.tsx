"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format, isPast, isToday, isFuture } from "date-fns"
import {
  Calendar as CalendarIcon, MapPin, Plus, Search, Filter,
  Copy, X as XIcon, MoreHorizontal, ListChecks, ScrollText,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/toast/toast-context"
import { useUrlState } from "@/lib/hooks/use-url-state"
import { EVENT_TYPES } from "@/constants"
import { cn } from "@/lib/utils/cn"
import type { Event } from "@/types"

type SubTeamLite = { id: string; name: string }

import { PageHeader } from "@/components/ui/page-header"
import { Toolbar, ToolbarGroup } from "@/components/ui/toolbar"
import { Button, IconButton } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { SidePanel } from "@/components/ui/side-panel"
import { Select } from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import { DateInput } from "@/components/ui/date-input"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/form-field"
import { DataList, DataItem } from "@/components/ui/data-list"
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { duplicateEventTemplate, cancelEvent } from "@/server/actions/events"

type EventWithTeams = Event & {
  event_sub_teams?: { sub_team_id: string; sub_teams?: { id: string; name: string } | null }[]
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  sunday_service: "bg-info",
  midweek_service: "bg-success",
  worship_night: "bg-primary",
  conference: "bg-warning",
  training: "bg-muted",
  rehearsal: "bg-muted",
  outreach: "bg-success",
  campus_event: "bg-info",
  department_event: "bg-warning",
  special_programme: "bg-danger",
}

const EMPTY_FORM = {
  title: "",
  eventType: "sunday_service",
  description: "",
  location: "",
  startTime: "",
  endTime: "",
  requiredSubTeams: [] as string[],
}

type Filter = "upcoming" | "past" | "all"

export function CalendarPageClient({
  events,
  subTeams,
}: {
  events: EventWithTeams[]
  subTeams: SubTeamLite[]
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const { get, set, clear } = useUrlState()

  const detailId = get("id")
  const showNew = get("new") === "1"

  const [filter, setFilter] = useState<Filter>("upcoming")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const detail = useMemo(() => events.find((e) => e.id === detailId) ?? null, [events, detailId])

  // Reset form when opening
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (showNew) setForm(EMPTY_FORM) }, [showNew])

  const filtered = useMemo(() => {
    let list = events
    if (filter === "upcoming") list = list.filter((e) => !isPast(new Date(e.start_time)) || isToday(new Date(e.start_time)))
    if (filter === "past") list = list.filter((e) => isPast(new Date(e.start_time)) && !isToday(new Date(e.start_time)))
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((e) =>
        e.title.toLowerCase().includes(q) ||
        (e.location ?? "").toLowerCase().includes(q) ||
        (e.event_type ?? "").toLowerCase().includes(q)
      )
    }
    return list
  }, [events, filter, query])

  const grouped = useMemo(() => {
    const map = new Map<string, EventWithTeams[]>()
    for (const e of filtered) {
      const key = format(new Date(e.start_time), "MMMM yyyy")
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return map
  }, [filtered])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.startTime) return
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
      if (!campus) throw new Error("No campus found")

      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: user } = await supabase
        .from("users").select("id").eq("auth_user_id", authUser?.id).single()

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
        }).select().single()
      if (error) throw new Error(error.message)

      if (event && form.requiredSubTeams.length > 0) {
        await supabase.from("event_sub_teams").insert(
          form.requiredSubTeams.map((st) => ({ event_id: event.id, sub_team_id: st }))
        )
      }
      clear("new")
      success("Event created", { label: "Open", onClick: () => set({ id: event!.id }) })
      router.refresh()
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to create event")
    } finally {
      setLoading(false)
    }
  }

  async function handleDuplicate(id: string) {
    const r = await duplicateEventTemplate(id)
    if (r.error) toastError(r.error)
    else { success("Event duplicated"); router.refresh() }
  }

  async function handleCancel(id: string) {
    const r = await cancelEvent(id)
    if (r.error) toastError(r.error)
    else { success("Event cancelled"); router.refresh(); clear("id") }
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Calendar"
        description="Services, events, rehearsals, and deadlines"
        icon={<CalendarIcon />}
        actions={
          <Button size="sm" onClick={() => set({ new: "1" })}>
            <Plus className="h-3.5 w-3.5" /> New event
          </Button>
        }
      />

      <Toolbar>
        <ToolbarGroup>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events…"
            leadingIcon={<Search />}
            className="h-8 w-[260px]"
          />
          <span className="hidden sm:inline-flex items-center gap-1 text-[12px] text-faint">
            <Filter className="h-3 w-3" /> View:
          </span>
          <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
            {(["upcoming", "past", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2.5 py-1 text-[12px] font-medium rounded-[5px] capitalize transition-colors",
                  filter === f
                    ? "bg-surface-subtle text-foreground"
                    : "text-muted hover:text-foreground"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </ToolbarGroup>
        <span className="text-[11.5px] text-faint tabular-nums">
          {filtered.length} {filtered.length === 1 ? "event" : "events"}
        </span>
      </Toolbar>

      <div className="px-5 sm:px-6 py-6 space-y-6">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon />}
            title={events.length === 0 ? "No events yet" : "No matching events"}
            description={
              events.length === 0
                ? "Create your first event to start planning your media schedule."
                : "Try a different search or switch the view."
            }
            action={events.length === 0 ? { label: "Create event", onClick: () => set({ new: "1" }) } : undefined}
          />
        ) : (
          Array.from(grouped.entries()).map(([month, monthEvents]) => (
            <div key={month}>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-[10.5px] font-semibold text-faint uppercase tracking-wider">
                  {month}
                </p>
                <div className="h-px flex-1 bg-border" aria-hidden="true" />
                <span className="text-[10.5px] text-faint tabular-nums">{monthEvents.length}</span>
              </div>
              <div className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
                {monthEvents.map((event) => {
                  const start = new Date(event.start_time)
                  const typeColor = EVENT_TYPE_COLORS[event.event_type ?? ""] ?? "bg-muted"
                  const typeLabel = EVENT_TYPES.find((t) => t.value === event.event_type)?.label
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => set({ id: event.id })}
                      className="group flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-surface-hover transition-colors"
                    >
                      {/* Type indicator */}
                      <div className={cn("h-7 w-0.5 rounded-full shrink-0", typeColor)} aria-hidden="true" />

                      {/* Date */}
                      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md bg-surface-subtle border border-border leading-none">
                        <span className="text-[8.5px] font-semibold uppercase tracking-wider text-faint">
                          {format(start, "MMM")}
                        </span>
                        <span className="text-[14px] font-semibold tabular-nums">
                          {format(start, "d")}
                        </span>
                      </div>

                      {/* Title + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13.5px] font-medium text-foreground truncate">
                            {event.title}
                          </span>
                          {typeLabel && <Badge variant="muted" size="sm">{typeLabel}</Badge>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
                          <span className="tabular-nums">{format(start, "EEE · h:mm a")}</span>
                          {event.location && (
                            <>
                              <span className="text-faint">·</span>
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              <span className="truncate max-w-[200px]">{event.location}</span>
                            </>
                          )}
                          {event.event_sub_teams && event.event_sub_teams.length > 0 && (
                            <>
                              <span className="text-faint">·</span>
                              <span className="text-faint">{event.event_sub_teams.length} sub-teams</span>
                            </>
                          )}
                        </div>
                      </div>

                      <StatusBadge status={event.status ?? "draft"} size="sm" />
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create modal */}
      <Modal
        open={showNew}
        onClose={() => clear("new")}
        title="New event"
        description="Add a service, rehearsal, or event to the calendar."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => clear("new")} disabled={loading}>Cancel</Button>
            <Button type="submit" form="create-event-form" loading={loading} disabled={loading}>
              Create event
            </Button>
          </>
        }
      >
        <form id="create-event-form" onSubmit={handleCreate} className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Event title" required className="sm:col-span-2">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Sunday Morning Service" required autoFocus />
            </FormField>
            <FormField label="Event type">
              <Select
                value={form.eventType}
                onChange={(v) => setForm({ ...form, eventType: v })}
                options={EVENT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              />
            </FormField>
            <FormField label="Location" helper="Optional venue or room">
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Main Auditorium" />
            </FormField>
            <FormField label="Start" required>
              <DateInput type="datetime-local" value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
            </FormField>
            <FormField label="End" helper="Optional">
              <DateInput type="datetime-local" value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Description" helper="What's happening at this event?">
            <Textarea value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Add context for the team…" />
          </FormField>
          <FormField label="Required sub-teams" helper="Add any teams that need to plan for this">
            <Combobox values={form.requiredSubTeams}
              onChange={(v) => setForm({ ...form, requiredSubTeams: v })}
              options={subTeams.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Select sub-teams…" />
          </FormField>
        </form>
      </Modal>

      {/* Detail side panel */}
      <SidePanel
        open={!!detail}
        onClose={() => clear("id")}
        title={detail?.title ?? "Event"}
        headerSlot={detail && <StatusBadge status={detail.status ?? "draft"} size="sm" />}
        size="lg"
        footer={
          detail && (
            <>
              <DropdownMenu
                trigger={
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                }
              >
                <DropdownMenuItem icon={<Copy />} onSelect={() => handleDuplicate(detail.id)}>
                  Duplicate event
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<XIcon />} variant="danger" onSelect={() => handleCancel(detail.id)}>
                  Cancel event
                </DropdownMenuItem>
              </DropdownMenu>
              <Button variant="secondary" size="sm" onClick={() => router.push(`/scheduling?event=${detail.id}`)}>
                <ListChecks className="h-3.5 w-3.5" /> Schedule
              </Button>
              <Button size="sm" onClick={() => router.push(`/run-sheets?event=${detail.id}`)}>
                <ScrollText className="h-3.5 w-3.5" /> Run sheet
              </Button>
            </>
          )
        }
      >
        {detail && <EventDetail event={detail} />}
      </SidePanel>
    </div>
  )
}

function EventDetail({ event }: { event: EventWithTeams }) {
  const start = new Date(event.start_time)
  const end = event.end_time ? new Date(event.end_time) : null
  const teams = event.event_sub_teams?.map((j) => j.sub_teams?.name).filter(Boolean) as string[] | undefined
  const upcomingOrLive = isFuture(start) || isToday(start)
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-subtle p-3">
        <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-surface border border-border leading-none">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-faint">
            {format(start, "MMM")}
          </span>
          <span className="text-[15px] font-semibold tabular-nums">{format(start, "d")}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-foreground tabular-nums">
            {format(start, "EEEE, MMMM d")}
          </div>
          <div className="text-[12px] text-muted tabular-nums">
            {format(start, "h:mm a")}
            {end && ` – ${format(end, "h:mm a")}`}
          </div>
        </div>
        {upcomingOrLive && (
          <Badge variant={isToday(start) ? "default" : "info"} size="sm">
            {isToday(start) ? "Today" : "Upcoming"}
          </Badge>
        )}
      </div>

      <DataList>
        <DataItem label="Type">
          {EVENT_TYPES.find((t) => t.value === event.event_type)?.label ?? event.event_type}
        </DataItem>
        <DataItem label="Location">{event.location}</DataItem>
        <DataItem label="Sub-teams">
          {teams && teams.length > 0
            ? (
              <div className="flex flex-wrap gap-1">
                {teams.map((t) => <Badge key={t} variant="muted" size="sm">{t}</Badge>)}
              </div>
            )
            : null}
        </DataItem>
        <DataItem label="Description">
          {event.description ? <p className="whitespace-pre-wrap">{event.description}</p> : null}
        </DataItem>
      </DataList>

      <div className="rounded-lg border border-border bg-surface-subtle/40 p-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint mb-2">
          Quick actions
        </p>
        <div className="grid grid-cols-2 gap-2">
          <a href={`/scheduling?event=${event.id}`} className="rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] font-medium hover:bg-surface-hover transition-colors flex items-center gap-2">
            <ListChecks className="h-3.5 w-3.5 text-faint" /> Build schedule
          </a>
          <a href={`/run-sheets?event=${event.id}`} className="rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] font-medium hover:bg-surface-hover transition-colors flex items-center gap-2">
            <ScrollText className="h-3.5 w-3.5 text-faint" /> Build run sheet
          </a>
        </div>
      </div>
    </div>
  )
}
