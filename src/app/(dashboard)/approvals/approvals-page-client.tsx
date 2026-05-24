"use client"

import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { useToast } from "@/lib/toast/toast-context"
import { useState } from "react"
import { ClipboardCheck, ExternalLink, Clock } from "lucide-react"
import { cn } from "@/lib/utils/cn"

interface ApprovalRecord {
  id: string
  status: string
  submitted_link: string | null
  feedback: string | null
  requests: { title: string; requesting_unit: string } | null
  tasks: { title: string } | null
  created_at: string
  decided_at: string | null
}

function historyBadgeVariant(status: string) {
  switch (status) {
    case "approved":           return "success" as const
    case "rejected":           return "danger" as const
    case "changes_requested":  return "warning" as const
    default:                   return "muted" as const
  }
}

export function ApprovalsPageClient({
  pending,
  history,
}: {
  pending: ApprovalRecord[]
  history: ApprovalRecord[]
}) {
  const router   = useRouter()
  const { success, error: showError, info } = useToast()
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [loading, setLoading]   = useState<Record<string, boolean>>({})

  async function handleAction(approvalId: string, status: string) {
    setLoading((p) => ({ ...p, [approvalId]: true }))
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("approvals")
        .update({ status, feedback: feedback[approvalId] || null, decided_at: new Date().toISOString() })
        .eq("id", approvalId)
      if (error) throw error

      if (status === "approved") {
        const { data: approval } = await supabase.from("approvals").select("request_id, task_id").eq("id", approvalId).single()
        if (approval?.request_id) await supabase.from("requests").update({ status: "completed" }).eq("id", approval.request_id)
        if (approval?.task_id)    await supabase.from("tasks").update({ status: "completed" }).eq("id", approval.task_id)
        success("Approved and marked complete.")
      } else if (status === "rejected") {
        info("Request rejected.")
      } else {
        info("Changes requested.")
      }

      router.refresh()
    } catch { showError("Action failed. Please try again.") }
    finally { setLoading((p) => ({ ...p, [approvalId]: false })) }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Approvals</h1>
        <p className="text-sm text-muted mt-0.5">Review and approve submitted work</p>
      </div>

      {/* Pending approvals */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-[13px] font-semibold text-foreground">Pending</p>
          {pending.length > 0 && (
            <span className="inline-flex items-center rounded-md bg-warning-soft text-warning border border-warning/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
              {pending.length}
            </span>
          )}
        </div>

        {pending.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="All caught up"
            description="No pending approvals at the moment."
          />
        ) : (
          <div className="space-y-3">
            {pending.map((a) => {
              const title = a.requests?.title ?? a.tasks?.title ?? "Approval Request"
              const isLoading = loading[a.id]
              return (
                <div
                  key={a.id}
                  className="rounded-xl border border-border bg-surface p-5 hover:border-border-strong transition-colors duration-150"
                >
                  {/* Title + meta */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{title}</p>
                      {a.requests?.requesting_unit && (
                        <p className="text-xs text-muted mt-0.5">From {a.requests.requesting_unit}</p>
                      )}
                      <p className="text-xs text-faint flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    {a.submitted_link && (
                      <a
                        href={a.submitted_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2"
                      >
                        View work <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>

                  {/* Feedback + actions */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      className="flex-1"
                      placeholder="Feedback (optional)"
                      value={feedback[a.id] ?? ""}
                      onChange={(e) => setFeedback((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    />
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleAction(a.id, "approved")}
                        loading={isLoading}
                        disabled={isLoading}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAction(a.id, "changes_requested")}
                        disabled={isLoading}
                      >
                        Request Changes
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleAction(a.id, "rejected")}
                        disabled={isLoading}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-border" aria-hidden="true" />

      {/* History */}
      <div>
        <p className="text-[13px] font-semibold text-foreground mb-3">History</p>
        {history.length === 0 ? (
          <p className="text-sm text-faint">No decisions recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:border-border-strong transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {a.requests?.title ?? a.tasks?.title ?? "Item"}
                  </p>
                  {a.feedback && (
                    <p className="text-xs text-faint truncate">{a.feedback}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 ml-3 shrink-0">
                  {a.decided_at && (
                    <span className="text-xs text-faint tabular-nums hidden sm:block">
                      {new Date(a.decided_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                  <Badge variant={historyBadgeVariant(a.status)} dot>
                    {a.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
