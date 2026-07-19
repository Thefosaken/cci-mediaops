"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format, formatDistanceToNow } from "date-fns"
import {
  ClipboardCheck, ExternalLink, CheckCircle2, XCircle,
  RotateCcw, MessageSquare, Clock,
} from "lucide-react"
import { useToast } from "@/lib/toast/toast-context"
import { useUrlState } from "@/lib/hooks/use-url-state"
import { cn } from "@/lib/utils/cn"

import { PageHeader } from "@/components/ui/page-header"
import { Toolbar, ToolbarGroup } from "@/components/ui/toolbar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SidePanel } from "@/components/ui/side-panel"
import { DataList, DataItem } from "@/components/ui/data-list"
import { FormField } from "@/components/ui/form-field"
import { Avatar } from "@/components/ui/avatar"
import { approveItem, requestChanges, rejectItem } from "@/server/actions/approvals"

interface ApprovalRecord {
  id: string
  status: string
  submitted_link: string | null
  feedback: string | null
  requests?: { id: string; title?: string; requesting_unit?: string; deadline?: string | null; priority?: string } | null
  tasks?: { id: string; title?: string } | null
  submitted_by_user?: { full_name: string | null; email: string | null } | null
  created_at: string
  decided_at: string | null
}

export function ApprovalsPageClient({
  pending,
  history,
}: {
  pending: ApprovalRecord[]
  history: ApprovalRecord[]
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const { get, set, clear } = useUrlState()

  const [tab, setTab] = useState<string>(get("tab") ?? "pending")
  const detailId = get("id")

  const all = useMemo(() => [...pending, ...history], [pending, history])
  const detail = useMemo(() => all.find((a) => a.id === detailId) ?? null, [all, detailId])

  const list = tab === "pending" ? pending : history

  async function approve(id: string, feedback?: string) {
    const r = await approveItem(id, feedback)
    if (r.error) toastError(r.error)
    else { success("Approved"); router.refresh(); clear("id") }
  }

  async function changes(id: string, feedback: string) {
    if (!feedback.trim()) { toastError("Add feedback explaining what to change"); return }
    const r = await requestChanges(id, feedback)
    if (r.error) toastError(r.error)
    else { success("Changes requested"); router.refresh(); clear("id") }
  }

  async function reject(id: string, reason: string) {
    if (!reason.trim()) { toastError("Add a reason for rejection"); return }
    const r = await rejectItem(id, reason)
    if (r.error) toastError(r.error)
    else { success("Rejected"); router.refresh(); clear("id") }
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Approvals"
        description="Review and decide on submitted work"
        icon={<ClipboardCheck />}
      />

      <div className="border-b border-border bg-canvas px-5 sm:px-6">
        <Tabs value={tab} onValueChange={(v) => { setTab(v); set({ tab: v === "pending" ? null : v }) }}>
          <TabsList>
            <TabsTrigger value="pending" badge={pending.length || undefined}>Pending</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="px-5 sm:px-6 py-6">
        {list.length === 0 ? (
          tab === "pending" ? (
            <EmptyState
              icon={<ClipboardCheck />}
              title="All caught up"
              description="No items waiting for your approval right now."
            />
          ) : (
            <EmptyState
              icon={<Clock />}
              title="No history yet"
              description="Decisions you make will be recorded here."
            />
          )
        ) : (
          <div className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
            {list.map((a) => {
              const title = a.requests?.title ?? a.tasks?.title ?? "Approval request"
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => set({ id: a.id })}
                  className="w-full text-left px-4 py-3 hover:bg-surface-hover transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-medium text-foreground">{title}</span>
                        {a.requests?.priority === "urgent" && (
                          <Badge variant="danger" size="sm">Urgent</Badge>
                        )}
                        {a.requests?.priority === "high" && (
                          <Badge variant="warning" size="sm">High</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[12px] text-muted flex-wrap">
                        {a.requests?.requesting_unit && (
                          <>
                            <span>{a.requests.requesting_unit}</span>
                            <span className="text-faint">·</span>
                          </>
                        )}
                        {a.submitted_by_user?.full_name && (
                          <>
                            <span className="inline-flex items-center gap-1">
                              <Avatar name={a.submitted_by_user.full_name} size="xs" />
                              {a.submitted_by_user.full_name}
                            </span>
                            <span className="text-faint">·</span>
                          </>
                        )}
                        <span className="tabular-nums">
                          {tab === "pending"
                            ? `Submitted ${formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}`
                            : a.decided_at && `Decided ${format(new Date(a.decided_at), "MMM d")}`}
                        </span>
                      </div>
                      {a.submitted_link && (
                        <a
                          href={a.submitted_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 mt-1.5 text-[12px] text-primary hover:underline underline-offset-2"
                        >
                          <ExternalLink className="h-3 w-3" /> Open submitted work
                        </a>
                      )}
                      {a.feedback && tab === "history" && (
                        <p className="mt-1.5 text-[12px] text-muted line-clamp-2">
                          <MessageSquare className="inline h-3 w-3 mr-1" />
                          {a.feedback}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={a.status} size="sm" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail panel */}
      <SidePanel
        open={!!detail}
        onClose={() => clear("id")}
        title={detail?.requests?.title ?? detail?.tasks?.title ?? "Approval"}
        headerSlot={detail && <StatusBadge status={detail.status} size="sm" />}
        size="lg"
      >
        {detail && (
          <ApprovalDetail
            approval={detail}
            onApprove={(fb) => approve(detail.id, fb)}
            onChanges={(fb) => changes(detail.id, fb)}
            onReject={(reason) => reject(detail.id, reason)}
          />
        )}
      </SidePanel>
    </div>
  )
}

function ApprovalDetail({
  approval: a,
  onApprove, onChanges, onReject,
}: {
  approval: ApprovalRecord
  onApprove: (fb?: string) => void
  onChanges: (fb: string) => void
  onReject: (reason: string) => void
}) {
  const [feedback, setFeedback] = useState("")
  const decided = a.status !== "pending"

  return (
    <div className="space-y-5">
      <DataList>
        <DataItem label="Type">
          {a.requests ? <Badge variant="muted" size="sm">Request</Badge> : <Badge variant="muted" size="sm">Task</Badge>}
        </DataItem>
        <DataItem label="Submitted by">
          {a.submitted_by_user ? (
            <div className="flex items-center gap-1.5">
              <Avatar name={a.submitted_by_user.full_name} email={a.submitted_by_user.email} size="xs" />
              {a.submitted_by_user.full_name ?? a.submitted_by_user.email}
            </div>
          ) : null}
        </DataItem>
        <DataItem label="Unit">{a.requests?.requesting_unit}</DataItem>
        <DataItem label="Due date">
          {a.requests?.deadline ? format(new Date(a.requests.deadline), "MMM d, yyyy") : null}
        </DataItem>
        <DataItem label="Submitted">
          <span className="tabular-nums">{format(new Date(a.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
        </DataItem>
        {decided && a.decided_at && (
          <DataItem label="Decided">
            <span className="tabular-nums">{format(new Date(a.decided_at), "MMM d, yyyy 'at' h:mm a")}</span>
          </DataItem>
        )}
      </DataList>

      {a.submitted_link && (
        <a
          href={a.submitted_link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-subtle/50 px-3 py-2.5 hover:bg-surface-subtle transition-colors"
        >
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
              Submitted work
            </p>
            <p className="text-[13px] text-primary truncate">{a.submitted_link}</p>
          </div>
          <ExternalLink className="h-4 w-4 text-primary shrink-0" />
        </a>
      )}

      {decided ? (
        a.feedback && (
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint mb-1.5">
              Decision feedback
            </p>
            <p className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">{a.feedback}</p>
          </div>
        )
      ) : (
        <>
          <FormField label="Feedback" helper="Required for request changes or rejection — optional for approve.">
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Add context for the requester…"
              rows={4}
            />
          </FormField>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={() => onApprove(feedback || undefined)}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </Button>
            <Button variant="secondary" onClick={() => onChanges(feedback)} disabled={!feedback.trim()}>
              <RotateCcw className="h-3.5 w-3.5" /> Request changes
            </Button>
            <Button variant="danger" onClick={() => onReject(feedback)} disabled={!feedback.trim()}>
              <XCircle className="h-3.5 w-3.5" /> Reject
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
