"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Inbox, Plus, Link2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/toast/toast-context"
import { useUrlState } from "@/lib/hooks/use-url-state"
import { PRIORITIES, REQUESTING_UNITS } from "@/constants"
import { applyView } from "@/lib/views/engine"
import { useViewState } from "@/lib/views/use-view-state"
import type { SavedView } from "@/lib/views/types"
import { ViewBar } from "@/components/views/view-bar"
import { uploadStagedAttachments } from "@/lib/attachments/upload"
import { AttachmentField } from "@/components/requests/attachment-field"
import { buildRequestFields } from "@/components/requests/request-fields"
import { RequestTable } from "@/components/requests/request-table"
import { RequestBoard } from "@/components/requests/request-board"
import { RequestDetailPanel } from "@/components/requests/request-detail-panel"
import type { RequestRow, SubTeamLite } from "@/components/requests/request-row-types"

import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import { DatePicker } from "@/components/ui/date-picker"
import { FormField } from "@/components/ui/form-field"
import { Switch } from "@/components/ui/switch"
import { DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import {
  updateRequestStatus,
  updateRequestPriority,
  requestClarification,
  completeRequest,
} from "@/server/actions/requests"

type PublicLinkLite = { id: string; token: string; label: string }

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

/** Statuses that mean the request has left the queue. */
const SETTLED = ["completed", "rejected", "cancelled"]

/**
 * Built-in views. These replace the old hardcoded status tabs — each one is
 * just a starting configuration the user is free to edit and re-save.
 *
 * Module-level so the reference is stable: it feeds a `useMemo` dep inside
 * `useViewState`.
 */
const SYSTEM_VIEWS: SavedView[] = [
  {
    id: "open",
    name: "Open requests",
    system: true,
    config: {
      layout: "table",
      filters: [{ fieldId: "status", operator: "is_not", values: SETTLED }],
      sorts: [{ fieldId: "deadline", direction: "asc" }],
      groupBy: null,
      hidden: [],
      query: "",
    },
  },
  {
    id: "triage",
    name: "Awaiting triage",
    system: true,
    config: {
      layout: "table",
      filters: [
        { fieldId: "status", operator: "is_any_of", values: ["submitted", "under_review", "clarification_needed"] },
      ],
      sorts: [{ fieldId: "created_at", direction: "asc" }],
      groupBy: null,
      hidden: [],
      query: "",
    },
  },
  {
    id: "pipeline",
    name: "Pipeline",
    system: true,
    config: {
      layout: "board",
      filters: [{ fieldId: "status", operator: "is_not", values: ["cancelled"] }],
      sorts: [{ fieldId: "priority", direction: "desc" }],
      groupBy: "status",
      hidden: [],
      query: "",
    },
  },
  {
    id: "by-team",
    name: "By sub-team",
    system: true,
    config: {
      layout: "board",
      filters: [{ fieldId: "status", operator: "is_not", values: SETTLED }],
      sorts: [{ fieldId: "deadline", direction: "asc" }],
      groupBy: "sub_teams",
      hidden: [],
      query: "",
    },
  },
  {
    id: "all",
    name: "All requests",
    system: true,
    config: {
      layout: "table",
      filters: [],
      sorts: [{ fieldId: "created_at", direction: "desc" }],
      groupBy: null,
      hidden: [],
      query: "",
    },
  },
]

export function RequestsPageClient({
  requests,
  subTeams,
  events,
  users,
  publicLinks,
  canCreateLinks,
  defaultUnit,
}: {
  requests: RequestRow[]
  subTeams: SubTeamLite[]
  events: { id: string; title: string; start_time: string }[]
  users: { id: string; full_name: string | null; email: string | null }[]
  publicLinks: PublicLinkLite[]
  canCreateLinks: boolean
  /** The filer's own unit, derived from their sub-team. Null = ask them. */
  defaultUnit: string | null
}) {
  const router = useRouter()
  const { success, error: toastError, warning } = useToast()
  const { get, set, clear } = useUrlState()

  const detailId = get("id")
  const showNew = get("new") === "1"
  const showNewLink = get("newLink") === "1"

  const fields = useMemo(() => buildRequestFields(subTeams, users), [subTeams, users])
  const view = useViewState({ scope: "requests", fields, systemViews: SYSTEM_VIEWS })

  const result = useMemo(
    // The board needs empty columns to exist as drop targets; the table would
    // only be cluttered by empty section headers.
    () => applyView(requests, fields, view.config, {
      includeEmptyGroups: view.config.layout === "board",
    }),
    [requests, fields, view.config]
  )
  const groupField = useMemo(
    () => fields.find((f) => f.id === view.config.groupBy) ?? null,
    [fields, view.config.groupBy]
  )

  const [loading, setLoading] = useState(false)
  const [clarifyFor, setClarifyFor] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [unitCustom, setUnitCustom] = useState(false)
  /**
   * Files chosen before the request exists. They can't be uploaded yet — there
   * is no id to hang them off — so they're held here and sent once the insert
   * comes back with one.
   */
  const [attachments, setAttachments] = useState<File[]>([])
  const dateFilled = format(new Date(), "MMM d, yyyy")

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (showNew) { setForm(EMPTY_FORM); setAttachments([]) } }, [showNew])

  const detail = useMemo(() => requests.find((r) => r.id === detailId) ?? null, [requests, detailId])

  /**
   * The panel navigates the *filtered* result set, not the raw list — stepping
   * from a record should follow the order on screen, not the order in the DB.
   */
  const orderedIds = useMemo(
    () => (result.groups ? result.groups.flatMap((g) => g.records) : result.records).map((r) => r.id),
    [result]
  )
  const detailIndex = detailId ? orderedIds.indexOf(detailId) : -1
  const detailPosition = detailIndex + 1

  function stepDetail(delta: number) {
    if (detailIndex === -1) return
    const next = orderedIds[detailIndex + delta]
    if (next) set({ id: next })
  }

  /**
   * The single write path for the two editable fields, shared by the board's
   * drag-to-move and the panel's inline dropdowns. Both surfaces hold their own
   * optimistic state and revert on a throw, so this only needs to fail loudly.
   */
  async function writeField(recordId: string, fieldId: string, nextValue: string) {
    if (fieldId === "status") {
      const r = await updateRequestStatus(recordId, nextValue)
      if (r.error) throw new Error(r.error)
    } else if (fieldId === "priority") {
      const r = await updateRequestPriority(recordId, nextValue)
      if (r.error) throw new Error(r.error)
    } else {
      throw new Error("That field can't be edited here.")
    }
    router.refresh()
  }

  const handleMove = writeField
  const handleChangeField = writeField

  function detailMenuItems(req: RequestRow) {
    return (
      <>
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => changeStatus(req.id, "under_review", "under review")}>
          Under review
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => changeStatus(req.id, "accepted", "accepted")}>
          Accept
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => changeStatus(req.id, "in_progress", "in progress")}>
          Start working
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => changeStatus(req.id, "awaiting_approval", "awaiting approval")}>
          Send for approval
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => handleComplete(req.id)}>
          Mark complete
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setClarifyFor(req.id)}>
          Ask for clarification
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => changeStatus(req.id, "rejected", "rejected")} variant="danger">
          Reject
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => changeStatus(req.id, "cancelled", "cancelled")} variant="danger">
          Cancel
        </DropdownMenuItem>
      </>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // The derived unit wins when we have one — the form field isn't rendered
    // in that case, so `form.requestingUnit` would be empty.
    const unit = defaultUnit ?? form.requestingUnit
    if (!form.title.trim() || !unit.trim() || form.subTeamIds.length === 0) {
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
          requesting_unit: unit,
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
        // This error was previously discarded, which is why a missing RLS
        // policy on `request_sub_teams` looked like "the form does nothing":
        // the request row saved, the routing silently did not.
        const { error: routingError } = await supabase.from("request_sub_teams").insert(
          form.subTeamIds.map((st) => ({ request_id: request.id, sub_team_id: st }))
        )
        if (routingError) throw new Error(`Request saved, but routing to sub-teams failed: ${routingError.message}`)
      }

      /*
        Attachments come after the insert, and their failure is reported
        separately. The request is already saved by this point — telling someone
        their submission failed because one PDF didn't upload would be a lie, and
        would tempt them into filing it a second time.
      */
      if (request && attachments.length > 0) {
        const failures = await uploadStagedAttachments(attachments, { requestId: request.id })
        if (failures.length > 0) {
          warning(
            failures.length === 1
              ? failures[0]
              : `${failures.length} files couldn't be attached. Add them from the request.`
          )
        }
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

  return (
    <>
    {/*
      The detail panel is a sibling of the ENTIRE page column — header, view
      bar and list all live to its left — so it runs the full height of the
      workspace, starting directly under the top bar. That is why the page is
      pinned to the viewport here (shell root is `h-dvh`, navbar is `h-14`)
      and scrolling moves inside the columns rather than the page.
    */}
    <div className="flex h-[calc(100dvh-56px)] overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
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

      <ViewBar
        fields={fields}
        records={requests}
        config={view.config}
        views={view.views}
        activeView={view.activeView}
        dirty={view.dirty}
        resultCount={result.total}
        onSelectView={view.selectView}
        onDeleteView={view.deleteView}
        onSaveAsNewView={view.saveAsNewView}
        onReset={view.reset}
        onSetLayout={view.setLayout}
        onSetGroupBy={view.setGroupBy}
        onSetQuery={view.setQuery}
        onToggleHidden={view.toggleHidden}
        onAddFilter={view.addFilter}
        onUpdateFilter={view.updateFilter}
        onRemoveFilter={view.removeFilter}
        onAddSort={view.addSort}
        onUpdateSort={view.updateSort}
        onRemoveSort={view.removeSort}
      />

        {/*
          `min-h-0` is load-bearing: a flex child defaults to `min-height:auto`,
          which refuses to shrink below its content, so without it the list
          would push the column taller than the viewport instead of scrolling
          inside it. The layouts are bounded by this box now rather than by a
          guessed viewport offset.
        */}
        <div className="min-h-0 flex-1 overflow-hidden px-5 sm:px-6 py-5">
          {view.config.layout === "board" ? (
            <RequestBoard
              groups={result.groups}
              fields={result.visibleFields}
              groupField={groupField}
              onOpen={(id) => set({ id })}
              onMove={handleMove}
              maxHeight="100%"
            />
          ) : (
            <RequestTable
              records={result.records}
              groups={result.groups}
              fields={result.visibleFields}
              groupField={groupField}
              onOpen={(id) => set({ id })}
              onChangeField={handleChangeField}
              maxHeight="100%"
              emptyAction={
                requests.length === 0 ? { label: "New request", onClick: () => set({ new: "1" }) } : undefined
              }
            />
          )}
        </div>
      </div>

      {detail && (
        <aside className="hidden h-full w-[400px] shrink-0 lg:block xl:w-[440px]">
          <RequestDetailPanel
            record={detail}
            fields={fields}
            position={detailPosition}
            total={result.total}
            onPrev={() => stepDetail(-1)}
            onNext={() => stepDetail(1)}
            onClose={() => clear("id")}
            menuItems={detailMenuItems(detail)}
            onChangeField={handleChangeField}
          />
        </aside>
      )}
    </div>

      {/*
        Below lg there is no width to compress into, so the same panel covers
        the screen instead of sitting beside the list. Same component, so the
        record navigator and field stack behave identically on a phone.
      */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-surface lg:hidden">
          <RequestDetailPanel
            record={detail}
            fields={fields}
            position={detailPosition}
            total={result.total}
            onPrev={() => stepDetail(-1)}
            onNext={() => stepDetail(1)}
            onClose={() => clear("id")}
            menuItems={detailMenuItems(detail)}
            onChangeField={handleChangeField}
          />
        </div>
      )}

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
            {/*
              Filing from inside the app: we already know who you are, so the
              unit is stated rather than asked for. Only people we can't derive
              a unit for (no sub-team) still get the picker.
            */}
            {defaultUnit ? (
              <FormField label="Requesting unit" helper="Taken from your sub-team">
                <Input value={defaultUnit} readOnly className="text-muted" tabIndex={-1} />
              </FormField>
            ) : (
              <>
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
              </>
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
            <FormField label="Due date" helper="Optional target date">
              <DatePicker
                value={form.deadline}
                onChange={(v) => setForm({ ...form, deadline: v })}
                placeholder="Select due date"
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
          <AttachmentField
            files={attachments}
            onFilesChange={setAttachments}
            disabled={loading}
            label="Attachments"
          />
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
        existingToken={publicLinks[0]?.token ?? null}
      />

      {/* Clarification prompt — reachable from the detail panel's kebab menu. */}
      <ClarifyModal
        requestId={clarifyFor}
        onClose={() => setClarifyFor(null)}
        onSubmit={(q) => { if (clarifyFor) handleClarify(clarifyFor, q) }}
      />
    </>
  )
}

/**
 * One modal, not two.
 *
 * It used to open on a confirmation step whose only content was a button that
 * said "generate" — asking you to confirm the thing you had just clicked. Now
 * the link is resolved as the modal opens: an existing active link is reused,
 * and only a campus with none generates one. Reusing matters — every open of
 * the old flow minted another row, so a few curious clicks left a pile of live
 * public links nobody could tell apart.
 */
function PublicLinkModal({
  open, onClose, existingToken,
}: {
  open: boolean
  onClose: () => void
  /** Token of an already-active public link, if the campus has one. */
  existingToken: string | null
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  // Resolve the link when the modal opens. `open` is the only trigger, so
  // reopening after a close starts clean rather than showing a stale URL.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!open) {
      setUrl(null)
      setCopied(false)
      setFailed(false)
      return
    }

    let cancelled = false

    async function resolve() {
      if (existingToken) {
        if (!cancelled) setUrl(`${window.location.origin}/request/public/${existingToken}`)
        return
      }
      const { generatePublicLink } = await import("@/server/actions/public-links")
      const r = await generatePublicLink()
      if (cancelled) return
      if (r.error || !r.data) {
        setFailed(true)
        toastError(r.error ?? "Could not create the link.")
        return
      }
      setUrl(`${window.location.origin}/request/public/${r.data.token}`)
      router.refresh()
    }

    void resolve()
    return () => { cancelled = true }
  }, [open, existingToken, router, toastError])

  async function handleCopy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      success("Link copied to clipboard")
    } catch {
      toastError("Couldn't copy — select the link and copy it manually.")
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Public request link"
      description="Anyone with this link can submit a request without signing in."
      size="sm"
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-4 py-2">
        <FormField label="Link URL">
          <div className="flex items-center gap-2">
            <Input
              value={url ?? (failed ? "" : "Creating link…")}
              readOnly
              placeholder={failed ? "Could not create a link" : undefined}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1"
            />
            <Button
              size="sm"
              variant={copied ? "primary" : "secondary"}
              onClick={handleCopy}
              disabled={!url}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </FormField>
      </div>
    </Modal>
  )
}

function ClarifyModal({
  requestId, onClose, onSubmit,
}: {
  requestId: string | null
  onClose: () => void
  onSubmit: (q: string) => void
}) {
  const [q, setQ] = useState("")
  return (
    <Modal
      open={!!requestId}
      onClose={() => { setQ(""); onClose() }}
      title="Ask for clarification"
      description="Posts a question on the request. Status moves to Clarification."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => { setQ(""); onClose() }}>Cancel</Button>
          <Button onClick={() => { onSubmit(q); setQ(""); onClose() }} disabled={!q.trim()}>
            Send
          </Button>
        </>
      }
    >
      <FormField label="Question" required>
        <Textarea autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="What's unclear about this request?" />
      </FormField>
    </Modal>
  )
}

