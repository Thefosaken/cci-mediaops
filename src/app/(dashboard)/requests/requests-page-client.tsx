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
import { PRIORITIES, REQUEST_STATUSES } from "@/constants"
import { Inbox, Plus, Filter } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import type { Request, SubTeam, Event } from "@/types"

// ── Helpers ──────────────────────────────────────────────────────────────────

function reqBadgeVariant(status: string) {
  switch (status) {
    case "in_progress":      return "info" as const
    case "completed":        return "success" as const
    case "rejected":
    case "cancelled":        return "danger" as const
    case "under_review":     return "info" as const
    case "awaiting_approval":return "warning" as const
    default:                 return "warning" as const
  }
}

function priorityBadgeVariant(priority: string) {
  switch (priority) {
    case "urgent": return "danger" as const
    case "high":   return "warning" as const
    case "low":    return "muted" as const
    default:       return "muted" as const
  }
}

const STATUS_FILTERS = [
  { value: "all",          label: "All" },
  { value: "submitted",    label: "Submitted" },
  { value: "in_progress",  label: "In Progress" },
  { value: "completed",    label: "Completed" },
]

const EMPTY_FORM = {
  title: "",
  requestingUnit: "",
  eventId: "",
  subTeamIds: [] as string[],
  description: "",
  desiredOutput: "",
  deadline: "",
  priority: "normal",
  approvalRequired: false,
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RequestsPageClient({
  requests,
  subTeams,
  events,
}: {
  requests: (Request & {
    request_sub_teams: { sub_team_id: string; sub_teams: { name: string } | null }[]
  })[]
  subTeams: SubTeam[]
  events: Event[]
}) {
  const router = useRouter()
  const { success, error: showError } = useToast()

  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [statusFilter, setStatusFilter] = useState("all")

  const subTeamOptions = subTeams.map((st) => ({ value: st.id, label: st.name }))
  const eventOptions = [
    { value: "", label: "No event linked" },
    ...events.map((ev) => ({ value: ev.id, label: ev.title })),
  ]
  const priorityOptions = PRIORITIES.map((p) => ({ value: p.value, label: p.label }))

  const openModal = useCallback(() => {
    setForm(EMPTY_FORM)
    setShowModal(true)
  }, [])

  const closeModal = useCallback(() => setShowModal(false), [])

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.requestingUnit.trim()) return
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

      if (error) throw new Error(error.message)

      if (request && form.subTeamIds.length > 0) {
        await supabase.from("request_sub_teams").insert(
          form.subTeamIds.map((st) => ({ request_id: request.id, sub_team_id: st }))
        )
      }

      closeModal()
      success("Request submitted successfully.")
      router.refresh()
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to submit request. Please try again."
      )
    } finally {
      setLoading(false)
    }
  }

  // Filter by status
  const filtered =
    statusFilter === "all"
      ? requests
      : requests.filter((r) => r.status === statusFilter)

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Requests</h1>
          <p className="text-sm text-muted mt-0.5">Submit, route, and manage media requests</p>
        </div>
        <Button onClick={openModal}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Request
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-faint mr-1" aria-hidden="true" />
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              "inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150",
              statusFilter === f.value
                ? "bg-primary-soft text-primary border border-primary/20"
                : "bg-surface border border-border text-muted hover:text-foreground hover:border-border-strong"
            )}
          >
            {f.label}
          </button>
        ))}
        {filtered.length > 0 && (
          <span className="ml-auto text-xs text-faint tabular-nums">
            {filtered.length} {filtered.length === 1 ? "request" : "requests"}
          </span>
        )}
      </div>

      {/* Request list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title={statusFilter === "all" ? "No requests yet" : `No ${statusFilter.replace("_", " ")} requests`}
          description={statusFilter === "all" ? "Submit your first media request to get started." : "Try a different filter to see more requests."}
          action={statusFilter === "all" ? { label: "New Request", onClick: openModal } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((req) => (
            <div
              key={req.id}
              className={cn(
                "flex items-start gap-4 rounded-xl border border-border bg-surface px-4 py-4",
                "transition-colors duration-150 hover:border-border-strong"
              )}
            >
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-start gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-foreground">{req.title}</h3>
                  {req.priority !== "normal" && (
                    <Badge variant={priorityBadgeVariant(req.priority)} dot className="shrink-0">
                      {req.priority}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted">
                  {req.requesting_unit}
                  {req.deadline && (
                    <> · Due {new Date(req.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>
                  )}
                </p>
                {req.request_sub_teams.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {req.request_sub_teams.map((rst) => (
                      <span
                        key={rst.sub_team_id}
                        className="inline-flex items-center rounded-md bg-surface-subtle border border-border px-2 py-0.5 text-[10px] font-medium text-muted"
                      >
                        {rst.sub_teams?.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Badge variant={reqBadgeVariant(req.status)} dot className="shrink-0">
                {req.status.replace(/_/g, " ")}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* New Request Modal */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title="New Media Request"
        description="Submit a request to the media team. Requests are routed to the relevant sub-teams."
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="new-request-form"
              loading={loading}
              disabled={loading}
            >
              Submit Request
            </Button>
          </>
        }
      >
        <form id="new-request-form" onSubmit={submitRequest} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Request title" required className="sm:col-span-2">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Sunday recap video edit"
                required
              />
            </FormField>

            <FormField label="Requesting unit" required>
              <Input
                value={form.requestingUnit}
                onChange={(e) => setForm({ ...form, requestingUnit: e.target.value })}
                placeholder="e.g. Teens Church, Choir"
                required
              />
            </FormField>

            <FormField label="Priority">
              <Select
                value={form.priority}
                onChange={(v) => setForm({ ...form, priority: v })}
                options={priorityOptions}
              />
            </FormField>

            <FormField label="Link to event" helper="Optional — associates this request with a calendar event">
              <Select
                value={form.eventId}
                onChange={(v) => setForm({ ...form, eventId: v })}
                options={eventOptions}
                searchable={events.length > 6}
              />
            </FormField>

            <FormField label="Deadline" helper="Optional target completion date">
              <DateInput
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Route to sub-teams" helper="Which teams should handle this request?">
            <Combobox
              values={form.subTeamIds}
              onChange={(v) => setForm({ ...form, subTeamIds: v })}
              options={subTeamOptions}
              placeholder="Select sub-teams…"
            />
          </FormField>

          <FormField label="Description" helper="What do you need and why?">
            <textarea
              className={cn(
                "flex min-h-[80px] w-full rounded-lg border border-border bg-canvas px-3 py-2",
                "text-sm text-foreground placeholder:text-faint resize-none",
                "transition-colors duration-150 hover:border-border-strong",
                "focus-visible:outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-focus-ring/20"
              )}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe what you need…"
            />
          </FormField>

          <FormField label="Desired output" helper="What should the final deliverable look like?">
            <textarea
              className={cn(
                "flex min-h-[60px] w-full rounded-lg border border-border bg-canvas px-3 py-2",
                "text-sm text-foreground placeholder:text-faint resize-none",
                "transition-colors duration-150 hover:border-border-strong",
                "focus-visible:outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-focus-ring/20"
              )}
              value={form.desiredOutput}
              onChange={(e) => setForm({ ...form, desiredOutput: e.target.value })}
              placeholder="e.g. 2-minute edited video for Instagram Reels"
            />
          </FormField>

          <label className="flex items-center gap-3 cursor-pointer group">
            <span className="relative flex h-5 w-5 items-center justify-center">
              <input
                type="checkbox"
                checked={form.approvalRequired}
                onChange={(e) => setForm({ ...form, approvalRequired: e.target.checked })}
                className="peer h-4 w-4 cursor-pointer rounded border border-border-strong bg-canvas transition-colors checked:bg-primary checked:border-primary focus-visible:ring-2 focus-visible:ring-focus-ring/20"
              />
            </span>
            <span className="text-sm text-muted group-hover:text-foreground transition-colors">
              Approval required before work begins
            </span>
          </label>
        </form>
      </Modal>
    </div>
  )
}
