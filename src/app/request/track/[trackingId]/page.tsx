import { getRequestByTrackingId } from "@/server/actions/public-requests"
import { Search, Inbox, CheckCircle2, Clock, AlertTriangle } from "lucide-react"
import { format } from "date-fns"

export const dynamic = "force-dynamic"

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ trackingId: string }>
}) {
  const { trackingId } = await params
  const request = await getRequestByTrackingId(trackingId)

  if (!request) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-surface to-canvas p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-lg">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-soft">
            <Search className="h-7 w-7 text-warning" />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-foreground">Request not found</h1>
          <p className="mt-2 text-[13px] text-muted leading-relaxed">
            No request matches tracking ID{" "}
            <span className="font-mono font-medium text-foreground">{trackingId}</span>.
            Check that the ID is correct, or contact the media team for help.
          </p>
        </div>
      </div>
    )
  }

  type StatusInfo = { label: string; color: string; icon: typeof Inbox }
  const statusConfig: Record<string, StatusInfo> = {
    submitted: { label: "Submitted", color: "text-info", icon: Clock },
    under_review: { label: "Under Review", color: "text-info", icon: Clock },
    clarification_needed: { label: "Clarification Needed", color: "text-warning", icon: AlertTriangle },
    accepted: { label: "Accepted", color: "text-info", icon: Clock },
    in_progress: { label: "In Progress", color: "text-info", icon: Clock },
    awaiting_approval: { label: "Awaiting Approval", color: "text-warning", icon: AlertTriangle },
    changes_requested: { label: "Changes Requested", color: "text-warning", icon: AlertTriangle },
    completed: { label: "Completed", color: "text-success", icon: CheckCircle2 },
    rejected: { label: "Rejected", color: "text-danger", icon: AlertTriangle },
    cancelled: { label: "Cancelled", color: "text-muted", icon: AlertTriangle },
  }

  const status = statusConfig[request.status] ?? { label: request.status, color: "text-muted", icon: Inbox }
  const StatusIcon = status.icon

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-surface to-canvas p-4">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-border bg-surface p-8 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-subtle">
              <StatusIcon className={`h-7 w-7 ${status.color}`} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">{request.title}</h1>
              <p className="mt-0.5 text-[13px] text-muted">
                Submitted {format(new Date(request.created_at), "MMM d, yyyy")}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-surface-subtle p-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Tracking ID</p>
              <p className="mt-0.5 font-mono text-[15px] font-bold tracking-wide text-foreground">
                {request.tracking_id}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Status</p>
              <p className={`mt-0.5 text-[14px] font-semibold ${status.color}`}>{status.label}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Requested by</p>
              <p className="mt-0.5 text-[14px] text-foreground">{request.requester_name}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Assigned to</p>
              <p className="mt-0.5 text-[14px] text-foreground">
                {request.request_sub_teams?.length
                  ? request.request_sub_teams.map((rst: { sub_teams?: { name: string } | null }) => rst.sub_teams?.name).filter(Boolean).join(", ")
                  : "Awaiting assignment"}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full ${status.color.replace("text-", "bg-")}`} />
              <div className="h-px flex-1 bg-border" />
            </div>
          </div>

          <p className="mt-6 text-center text-[12px] text-faint">
            Have questions? Contact the media team directly.
          </p>
        </div>
      </div>
    </div>
  )
}
