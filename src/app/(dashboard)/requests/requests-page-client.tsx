"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  Inbox, Plus, Search, MessageSquare, MoreHorizontal,
  CheckCircle2, XCircle, CornerUpLeft, FileText, AlertTriangle, Link2, ExternalLink,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/toast/toast-context"
import { useUrlState } from "@/lib/hooks/use-url-state"
import { PRIORITIES, REQUESTING_UNITS } from "@/constants"
import { cn } from "@/lib/utils/cn"
type SubTeamLite = { id: string; name: string }

import { PageHeader } from "@/components/ui/page-header"
import { Toolbar, ToolbarGroup } from "@/components/ui/toolbar"
import { Button } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { SidePanel } from "@/components/ui/side-panel"
import { Select } from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import { DatePicker } from "@/components/ui/date-picker"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/form-field"
import { Switch } from "@/components/ui/switch"
import { DataList, DataItem } from "@/components/ui/data-list"
import { Avatar } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ActivityThread } from "@/components/shared/activity-thread"
import {
  updateRequestStatus,
  requestClarification,
  completeRequest,
} from "@/server/actions/requests"

type PublicLinkLite = { id: string; token: string; label: string }

type RequestRow = {
  id: string
  title: string
  requesting_unit: string | null
  status: string
  priority: string
  deadline: string | null
  description: string | null
  desired_output: string | null
  approval_required: boolean | null
  created_at: string
  tracking_id: string | null
  requester_name: string | null
  requester_contact: string | null
  public_request_link_id: string | null
  request_sub_teams: { sub_team_id: string; sub_teams: { id: string; name: string } | null }[]
  requester: { full_name: string | null; email: string | null } | null
  events?: { id: string; title: string; start_time: string } | null
}

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

const STATUS_FILTERS = [
  { value: "open", label: "Open" },
  { value: "submitted", label: "Submitted" },
  { value: "in_progress", label: "In progress" },
  { value: "awaiting_approval", label: "Awaiting approval" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
]

export function RequestsPageClient({
  requests,
  subTeams,
  events,
  publicLinks,
  canCreateLinks,
}: {
  requests: RequestRow[]
  subTeams: SubTeamLite[]
  events: { id: string; title: string; start_time: string }[]
  users: { id: string; full_name: string | null; email: string | null }[]
  publicLinks: PublicLinkLite[]
  canCreateLinks: boolean
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const { get, set, clear } = useUrlState()

  const detailId = get("id")
  const showNew = get("new") === "1"
  const showNewLink = get("newLink") === "1"
  const initialStatus = get("status") ?? "open"

  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [query, setQuery] = useState("")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [subTeamFilter, setSubTeamFilter] = useState<string>("all")

  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [unitCustom, setUnitCustom] = useState(false)
  const dateFilled = format(new Date(), "MMM d, yyyy")

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (showNew) setForm(EMPTY_FORM) }, [showNew])

  const detail = useMemo(() => requests.find((r) => r.id === detailId) ?? null, [requests, detailId])

  const filtered = useMemo(() => {
    let list = requests
    if (statusFilter === "open") {
      list = list.filter((r) =>
        !["completed", "rejected", "cancelled"].includes(r.status)
      )
    } else if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter)
    }
    if (priorityFilter !== "all") list = list.filter((r) => r.priority === priorityFilter)
    if (subTeamFilter !== "all") list = list.filter((r) =>
      r.request_sub_teams.some((j) => j.sub_team_id === subTeamFilter)
    )
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        (r.requesting_unit ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
      )
    }
    return list
  }, [requests, statusFilter, priorityFilter, subTeamFilter, query])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.requestingUnit.trim() || form.subTeamIds.length === 0) {
      toastError("Add a title, requesting unit, and at least one sub-team.")
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
      if (!campus) throw new Error("No campus found")
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from("users").select("id").eq("auth_user_id", authUser?.id).single()

      const { data: request, error } = await supabase
        .from("requests")
        .insert({
          campus_id: campus.id,
          event_id: form.eventId || null,
          title: form.title,
          requesting_unit: form.requestingUnit,
          requester_id: profile?.id,
          description: form.description || null,
          desired_output: form.desiredOutput || null,
          deadline: form.deadline || null,
          priority: form.priority,
          status: "submitted",
          approval_required: form.approvalRequired,
        }).select().single()
      if (error) throw new Error(error.message)
      if (request && form.subTeamIds.length > 0) {
        await supabase.from("request_sub_teams").insert(
          form.subTeamIds.map((st) => ({ request_id: request.id, sub_team_id: st }))
        )
      }
      clear("new")
      success("Request submitted", { label: "Open", onClick: () => set({ id: request!.id }) })
      router.refresh()
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not submit request")
    } finally { setLoading(false) }
  }

  async function changeStatus(id: string, status: string, label: string) {
    const r = await updateRequestStatus(id, status)
    if (r.error) toastError(r.error)
    else { success(`Marked as ${label}`); router.refresh() }
  }

  async function handleComplete(id: string) {
    const r = await completeRequest(id)
    if (r.error) toastError(r.error)
    else { success("Request marked complete"); router.refresh() }
  }

  async function handleClarify(id: string, question: string) {
    if (!question.trim()) return
    const r = await requestClarification(id, question)
    if (r.error) toastError(r.error)
    else { success("Clarification requested"); router.refresh() }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, submitted: 0, in_progress: 0, awaiting_approval: 0, completed: 0, all: requests.length }
    requests.forEach((r) => {
      if (!["completed", "rejected", "cancelled"].includes(r.status)) c.open++
      c[r.status] = (c[r.status] ?? 0) + 1
    })
    return c
  }, [requests])

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Requests"
        description="Submit, route, and resolve media requests"
        icon={<Inbox />}
        actions={
          <div className="flex items-center gap-2">
            {canCreateLinks && (
              <Button size="sm" variant="secondary" onClick={() => set({ newLink: "1" })}>
                <Link2 className="h-3.5 w-3.5" /> Generate link
              </Button>
            )}
            <Button size="sm" onClick={() => set({ new: "1" })}>
              <Plus className="h-3.5 w-3.5" /> New request
            </Button>
          </div>
        }
      />

      {/* Status tabs */}
      <div className="border-b border-border bg-canvas px-5 sm:px-6">
        <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); set({ status: v === "open" ? null : v }) }}>
          <TabsList>
            {STATUS_FILTERS.map((s) => (
              <TabsTrigger key={s.value} value={s.value} badge={counts[s.value] || undefined}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Toolbar>
        <ToolbarGroup>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search requests…"
            leadingIcon={<Search />}
            className="h-8 w-[260px]"
          />
          <Select
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={[{ value: "all", label: "All priorities" }, ...PRIORITIES.map((p) => ({ value: p.value, label: p.label }))]}
            className="!w-[150px] [&>button]:h-8"
            aria-label="Priority filter"
          />
          <Select
            value={subTeamFilter}
            onChange={setSubTeamFilter}
            options={[{ value: "all", label: "All sub-teams" }, ...subTeams.map((s) => ({ value: s.id, label: s.name }))]}
            className="!w-[170px] [&>button]:h-8"
            aria-label="Sub-team filter"
          />
        </ToolbarGroup>
        <span className="text-[11.5px] text-faint tabular-nums">{filtered.length} {filtered.length === 1 ? "request" : "requests"}</span>
      </Toolbar>

      <div className="px-5 sm:px-6 py-6">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title={requests.length === 0 ? "No requests yet" : "No matching requests"}
            description={
              requests.length === 0
                ? "Submit your first media request to start routing work to sub-teams."
                : "Adjust filters or search to see more results."
            }
            action={requests.length === 0 ? { label: "New request", onClick: () => set({ new: "1" }) } : undefined}
          />
        ) : (
          <div className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
            {filtered.map((req) => (
              <button
                key={req.id}
                type="button"
                onClick={() => set({ id: req.id })}
                className="group w-full text-left px-4 py-3 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-medium text-foreground">{req.title}</span>
                      {req.priority === "urgent" && (
                        <Badge variant="danger" size="sm">
                          <AlertTriangle className="h-2.5 w-2.5" /> Urgent
                        </Badge>
                      )}
                      {req.priority === "high" && (
                        <Badge variant="warning" size="sm">High</Badge>
                      )}
                      {req.approval_required && (
                        <Badge variant="info" size="sm">Approval required</Badge>
                      )}
                      {req.public_request_link_id && (
                        <Badge variant="muted" size="sm">
                          <ExternalLink className="h-2.5 w-2.5" /> Public
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[12px] text-muted flex-wrap">
                      <span>{req.requesting_unit ?? "Unknown unit"}</span>
                      {req.requester?.full_name && (
                        <>
                          <span className="text-faint">·</span>
                          <span className="flex items-center gap-1">
                            <Avatar name={req.requester.full_name} size="xs" />
                            {req.requester.full_name}
                          </span>
                        </>
                      )}
                      {req.deadline && (
                        <>
                          <span className="text-faint">·</span>
                          <span className="tabular-nums">Due {format(new Date(req.deadline), "MMM d")}</span>
                        </>
                      )}
                    </div>
                    {req.request_sub_teams.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {req.request_sub_teams.map((rst) => (
                          <Badge key={rst.sub_team_id} variant="muted" size="sm">
                            {rst.sub_teams?.name ?? "—"}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={req.status} size="sm" />
                    <span className="text-[11px] text-faint tabular-nums">
                      {format(new Date(req.created_at), "MMM d")}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal
        open={showNew}
        onClose={() => clear("new")}
        title="New request"
        description="Submit a media request. It'll be routed to the sub-teams you choose."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => clear("new")} disabled={loading}>Cancel</Button>
            <Button type="submit" form="new-request-form" loading={loading} disabled={loading}>Submit</Button>
          </>
        }
      >
        <form id="new-request-form" onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Request title" required className="sm:col-span-2">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Sunday recap video edit" required autoFocus />
            </FormField>
            <FormField label="Requesting unit" required>
              <Select
                value={unitCustom ? "Others" : form.requestingUnit}
                onChange={(v) => {
                  if (v === "Others") {
                    setUnitCustom(true)
                    setForm({ ...form, requestingUnit: "" })
                  } else {
                    setUnitCustom(false)
                    setForm({ ...form, requestingUnit: v })
                  }
                }}
                options={[
                  { value: "", label: "Select a unit…" },
                  ...REQUESTING_UNITS.map((u) => ({ value: u, label: u })),
                  { value: "Others", label: "Others (type in)" },
                ]}
              />
            </FormField>
            {unitCustom && (
              <FormField label="Specify unit" required>
                <Input
                  value={form.requestingUnit}
                  onChange={(e) => setForm({ ...form, requestingUnit: e.target.value })}
                  placeholder="Type your unit name"
                  required
                  autoFocus
                />
              </FormField>
            )}
            <FormField label="Priority">
              <Select value={form.priority} onChange={(v) => setForm({ ...form, priority: v })}
                options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
            </FormField>
            <FormField label="Linked event" helper="Optional — connect to a calendar event">
              <Select
                value={form.eventId}
                onChange={(v) => setForm({ ...form, eventId: v })}
                options={[{ value: "", label: "No event linked" }, ...events.map((e) => ({ value: e.id, label: e.title }))]}
                searchable={events.length > 6}
              />
            </FormField>
            <FormField label="Date filled">
              <Input value={dateFilled} readOnly className="text-muted" tabIndex={-1} />
            </FormField>
            <FormField label="Deadline" helper="Optional target date">
              <DatePicker
                value={form.deadline}
                onChange={(v) => setForm({ ...form, deadline: v })}
                placeholder="Select deadline"
              />
            </FormField>
            <FormField label="Route to sub-teams" required helper="Pick one or more" className="sm:col-span-2">
              <Combobox values={form.subTeamIds}
                onChange={(v) => setForm({ ...form, subTeamIds: v })}
                options={subTeams.map((s) => ({ value: s.id, label: s.name }))}
                placeholder="Select sub-teams…" />
            </FormField>
          </div>
          <FormField label="Description" helper="What do you need and why?">
            <Textarea value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe the request…" />
          </FormField>
          <FormField label="Desired output" helper="What does done look like?">
            <Textarea value={form.desiredOutput}
              onChange={(e) => setForm({ ...form, desiredOutput: e.target.value })}
              placeholder="e.g. 2-minute video for Instagram Reels" rows={2} />
          </FormField>
          <div className="flex items-center justify-between rounded-md border border-border bg-surface-subtle/50 px-3 py-2.5">
            <div>
              <p className="text-[13px] font-medium text-foreground">Approval required</p>
              <p className="text-[11.5px] text-muted">Submitted work must be approved before completion.</p>
            </div>
            <Switch checked={form.approvalRequired} onChange={(v) => setForm({ ...form, approvalRequired: v })} />
          </div>
        </form>
      </Modal>

      {/* Generate public link modal */}
      <PublicLinkModal
        open={showNewLink}
        onClose={() => clear("newLink")}
      />

      {/* Detail panel */}
      <SidePanel
        open={!!detail}
        onClose={() => clear("id")}
        title={detail?.title ?? "Request"}
        headerSlot={detail && <StatusBadge status={detail.status} size="sm" />}
        size="lg"
        footer={
          detail && (
            <>
              <ClarifyAction requestId={detail.id} onSubmit={(q) => handleClarify(detail.id, q)} />
              <DropdownMenu
                trigger={
                  <Button variant="secondary" size="sm">
                    Change status <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                }
              >
                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => changeStatus(detail.id, "under_review", "under review")}>
                  Under review
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => changeStatus(detail.id, "accepted", "accepted")}>
                  Accept
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => changeStatus(detail.id, "in_progress", "in progress")}>
                  Start working
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => changeStatus(detail.id, "awaiting_approval", "awaiting approval")}>
                  Send for approval
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => changeStatus(detail.id, "rejected", "rejected")} variant="danger">
                  Reject
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => changeStatus(detail.id, "cancelled", "cancelled")} variant="danger">
                  Cancel
                </DropdownMenuItem>
              </DropdownMenu>
              <Button size="sm" onClick={() => handleComplete(detail.id)}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark complete
              </Button>
            </>
          )
        }
      >
        {detail && <RequestDetail request={detail} />}
      </SidePanel>
    </div>
  )
}

function PublicLinkModal({
  open, onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [label, setLabel] = useState("")
  const [saving, setSaving] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function create() {
    if (!label.trim()) {
      toastError("Add a label.")
      return
    }
    setSaving(true)
    const { generatePublicLink } = await import("@/server/actions/public-links")
    const r = await generatePublicLink({ label: label.trim() })
    setSaving(false)
    if (r.error) { toastError(r.error); return }
    const url = `${window.location.origin}/request/public/${r.data!.token}`
    setGeneratedUrl(url)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      success("Link copied to clipboard")
    } catch {
      setCopied(false)
    }
    router.refresh()
  }

  function handleClose() {
    setLabel("")
    setGeneratedUrl(null)
    setCopied(false)
    onClose()
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(generatedUrl!)
      setCopied(true)
      success("Link copied to clipboard")
    } catch {
      setCopied(false)
    }
  }

  if (generatedUrl) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Public request link"
        description="Share this link with anyone who needs to submit a request."
        size="sm"
      >
        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border bg-surface-subtle px-4 py-3">
            <p className="text-[11.5px] text-faint mb-1.5">Link label</p>
            <p className="text-[13px] font-medium text-foreground">{label}</p>
          </div>
          <FormField label="Link URL">
            <div className="flex items-center gap-2">
              <Input
                value={generatedUrl}
                readOnly
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1"
              />
              <Button size="sm" variant={copied ? "primary" : "secondary"} onClick={handleCopy}>
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </FormField>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Generate public request link"
      description="Anyone with this link can submit a request without logging in."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={create} loading={saving} disabled={saving || !label.trim()}>
            <Link2 className="h-3.5 w-3.5" /> Generate
          </Button>
        </>
      }
    >
      <div className="space-y-3 py-2">
        <FormField label="Link label" required helper="e.g. Teens Church Requests">
          <Input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Teens Church Design Requests"
            autoComplete="off"
          />
        </FormField>
        <div className="rounded-lg border border-info/20 bg-info-soft/20 px-3 py-2.5">
          <p className="text-[12px] text-info">
            The person submitting the request will select which team to route to.
          </p>
        </div>
      </div>
    </Modal>
  )
}

function ClarifyAction({ requestId, onSubmit }: { requestId: string; onSubmit: (q: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <CornerUpLeft className="h-3.5 w-3.5" /> Ask for clarification
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Ask for clarification"
        description="Posts a question on the request. Status moves to Clarification."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onSubmit(q); setQ(""); setOpen(false) }} disabled={!q.trim()}>
              Send
            </Button>
          </>
        }
      >
        <FormField label="Question" required>
          <Textarea autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={`What's unclear about request ${requestId.slice(0, 8)}?`} />
        </FormField>
      </Modal>
    </>
  )
}

function RequestDetail({ request: req }: { request: RequestRow }) {
  const teams = req.request_sub_teams?.map((j) => j.sub_teams?.name).filter(Boolean) as string[] | undefined
  return (
    <div className="space-y-5">
      <DataList>
        <DataItem label="Requested by">
          {req.requester ? (
            <div className="flex items-center gap-2">
              <Avatar name={req.requester.full_name} email={req.requester.email} size="xs" />
              <span>{req.requester.full_name ?? req.requester.email}</span>
            </div>
          ) : null}
        </DataItem>
        <DataItem label="Unit">{req.requesting_unit}</DataItem>
        <DataItem label="Priority">
          <Badge
            variant={req.priority === "urgent" ? "danger" : req.priority === "high" ? "warning" : "muted"}
            size="sm"
            dot
          >
            {req.priority}
          </Badge>
        </DataItem>
        <DataItem label="Deadline">
          {req.deadline ? (
            <span className="tabular-nums">{format(new Date(req.deadline), "EEEE, MMMM d, yyyy")}</span>
          ) : null}
        </DataItem>
        <DataItem label="Event">{req.events?.title}</DataItem>
        <DataItem label="Sub-teams">
          {teams && teams.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {teams.map((t) => <Badge key={t} variant="muted" size="sm">{t}</Badge>)}
            </div>
          ) : null}
        </DataItem>
        <DataItem label="Approval">
          {req.approval_required ? <Badge variant="info" size="sm">Required</Badge> : <span className="text-faint">Not required</span>}
        </DataItem>
        <DataItem label="Submitted">
          <span className="tabular-nums">{format(new Date(req.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
        </DataItem>
      </DataList>

      {req.description && (
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint mb-2 flex items-center gap-1.5">
            <FileText className="h-3 w-3" /> Description
          </p>
          <p className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">{req.description}</p>
        </div>
      )}
      {req.desired_output && (
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint mb-2">Desired output</p>
          <p className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">{req.desired_output}</p>
        </div>
      )}

      <div className="border-t border-border pt-5">
        <ActivityThread entityType="request" entityId={req.id} />
      </div>
    </div>
  )
}
