"use client"

import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useState } from "react"

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

export function ApprovalsPageClient({
  pending,
  history,
}: {
  pending: ApprovalRecord[]
  history: ApprovalRecord[]
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  async function handleAction(approvalId: string, status: string) {
    const supabase = createClient()
    await supabase
      .from("approvals")
      .update({
        status,
        feedback: feedback[approvalId] || null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", approvalId)

    if (status === "approved") {
      const { data: approval } = await supabase
        .from("approvals")
        .select("request_id, task_id")
        .eq("id", approvalId)
        .single()

      if (approval?.request_id) {
        await supabase.from("requests").update({ status: "completed" }).eq("id", approval.request_id)
      }
      if (approval?.task_id) {
        await supabase.from("tasks").update({ status: "completed" }).eq("id", approval.task_id)
      }
    }

    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
        <p className="text-sm text-muted-foreground">Review and approve submitted work</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Pending Approval ({pending.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending approvals</p>
          ) : (
            pending.map((a) => (
              <div key={a.id} className="rounded-md border p-4">
                <p className="font-medium">{a.requests?.title ?? a.tasks?.title ?? "Approval Request"}</p>
                <p className="text-sm text-muted-foreground">
                  {a.requests?.requesting_unit && `From: ${a.requests.requesting_unit}`}
                </p>
                {a.submitted_link && (
                  <a href={a.submitted_link} target="_blank" className="text-sm text-blue-600 underline">View submitted work</a>
                )}
                <div className="mt-3 flex gap-3">
                  <input
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Feedback (optional)"
                    value={feedback[a.id] ?? ""}
                    onChange={(e) => setFeedback((prev) => ({ ...prev, [a.id]: e.target.value }))}
                  />
                  <Button size="sm" onClick={() => handleAction(a.id, "approved")}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => handleAction(a.id, "changes_requested")}>Request Changes</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleAction(a.id, "rejected")}>Reject</Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Approval History</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet</p>
          ) : (
            <div className="space-y-2">
              {history.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <span className="font-medium">{a.requests?.title ?? a.tasks?.title ?? "Item"}</span>
                  <span className={`capitalize ${a.status === "approved" ? "text-green-600" : a.status === "rejected" ? "text-red-600" : "text-yellow-600"}`}>
                    {a.status.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
