import Link from "next/link"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/ui/page-header"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  BarChart3, Inbox, CalendarCheck, Wrench, AlertTriangle, ClipboardCheck,
  TrendingUp, TrendingDown, ArrowRight, CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { subDays, isAfter } from "date-fns"

export const dynamic = "force-dynamic"

export default async function ReportsPage() {
  await requireAuth()
  const supabase = await createClient()

  const fourWeeksAgo = subDays(new Date(), 28).toISOString()
  const twoWeeksAgo = subDays(new Date(), 14).toISOString()

  const [
    pendingReqsRes,
    completedReqsRes,
    inProgressReqsRes,
    pendingApprovalsRes,
    unconfirmedSlotsRes,
    confirmedSlotsRes,
    equipmentIssuesRes,
    equipmentTotalRes,
    openIncidentsRes,
    resolvedIncidentsRes,
    eventsRes,
    recentRequestsRes,
    subTeamsRes,
  ] = await Promise.all([
    supabase.from("requests").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review", "clarification_needed"]),
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("status", "completed").gte("created_at", fourWeeksAgo),
    supabase.from("requests").select("id", { count: "exact", head: true }).in("status", ["in_progress", "awaiting_approval"]),
    supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("schedule_slots").select("id", { count: "exact", head: true }).eq("confirmation_status", "pending"),
    supabase.from("schedule_slots").select("id", { count: "exact", head: true }).eq("confirmation_status", "confirmed"),
    supabase.from("equipment_items").select("id", { count: "exact", head: true }).in("condition_status", ["faulty", "missing", "under_repair"]),
    supabase.from("equipment_items").select("id", { count: "exact", head: true }),
    supabase.from("incidents").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]),
    supabase.from("incidents").select("id", { count: "exact", head: true }).eq("status", "resolved").gte("created_at", fourWeeksAgo),
    supabase.from("events").select("id, status, start_time"),
    supabase.from("requests").select("id, status, sub_team:request_sub_teams(sub_teams(id, name)), created_at, priority").gte("created_at", fourWeeksAgo).order("created_at", { ascending: false }),
    supabase.from("sub_teams").select("id, name").eq("status", "active").order("name"),
  ])

  const events = eventsRes.data ?? []
  const totalEvents = events.length
  const completedEvents = events.filter((e) => e.status === "completed").length
  const upcomingEvents = events.filter((e) => new Date(e.start_time) > new Date()).length
  const liveEvents = events.filter((e) => e.status === "live").length
  const completionPct = totalEvents > 0 ? Math.round((completedEvents / totalEvents) * 100) : 0

  const totalSlots = (confirmedSlotsRes.count ?? 0) + (unconfirmedSlotsRes.count ?? 0)
  const confirmationPct = totalSlots > 0 ? Math.round(((confirmedSlotsRes.count ?? 0) / totalSlots) * 100) : 0

  const equipmentHealthPct = (equipmentTotalRes.count ?? 0) > 0
    ? Math.round(((equipmentTotalRes.count! - (equipmentIssuesRes.count ?? 0)) / equipmentTotalRes.count!) * 100)
    : 100

  // Sub-team activity (request count per sub-team over last 4 weeks)
  const subTeams = subTeamsRes.data ?? []
  const recentRequests = recentRequestsRes.data ?? []
  const subTeamActivity = subTeams.map((st) => {
    const count = recentRequests.filter((r) => {
      const subs = r.sub_team as unknown as { sub_teams?: { id?: string } | null }[] | undefined
      return subs?.some((s) => s.sub_teams?.id === st.id)
    }).length
    return { ...st, count }
  }).sort((a, b) => b.count - a.count)

  const newReqsLast2w = recentRequests.filter((r) => isAfter(new Date(r.created_at), new Date(twoWeeksAgo))).length
  const newReqs2w_4w = recentRequests.length - newReqsLast2w
  const reqTrendUp = newReqsLast2w > newReqs2w_4w

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Reports"
        description="Operational health across all sub-teams"
        icon={<BarChart3 />}
        badge={<Badge variant="muted" size="sm">Last 28 days</Badge>}
      />

      <div className="px-5 sm:px-6 py-6 space-y-6">
        {/* KPI cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Pending requests"
            value={pendingReqsRes.count ?? 0}
            href="/requests?status=submitted"
            Icon={Inbox}
            tone={(pendingReqsRes.count ?? 0) > 0 ? "warning" : "neutral"}
            trend={{ value: newReqsLast2w, label: "new (2w)", up: reqTrendUp }}
          />
          <KpiCard
            label="Pending approvals"
            value={pendingApprovalsRes.count ?? 0}
            href="/approvals"
            Icon={ClipboardCheck}
            tone={(pendingApprovalsRes.count ?? 0) > 0 ? "info" : "neutral"}
          />
          <KpiCard
            label="Equipment issues"
            value={equipmentIssuesRes.count ?? 0}
            href="/equipment?tab=issues"
            Icon={Wrench}
            tone={(equipmentIssuesRes.count ?? 0) > 0 ? "danger" : "neutral"}
            sub={`${equipmentHealthPct}% healthy`}
          />
          <KpiCard
            label="Open incidents"
            value={openIncidentsRes.count ?? 0}
            href="/incidents"
            Icon={AlertTriangle}
            tone={(openIncidentsRes.count ?? 0) > 0 ? "danger" : "neutral"}
            sub={`${resolvedIncidentsRes.count ?? 0} resolved (28d)`}
          />
        </div>

        {/* Two large progress cards */}
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
                  Event completion
                </p>
                <p className="text-[28px] font-semibold text-foreground tabular-nums leading-none mt-2">
                  {completionPct}%
                </p>
                <p className="text-[12px] text-muted mt-1">
                  {completedEvents} of {totalEvents} events completed
                </p>
              </div>
              <CalendarCheck className="h-4 w-4 text-faint" />
            </div>
            <ProgressBar value={completionPct} />
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
              <Mini label="Upcoming" value={upcomingEvents} />
              <Mini label="Live" value={liveEvents} />
              <Mini label="Total" value={totalEvents} />
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
                  Roster confirmation
                </p>
                <p className="text-[28px] font-semibold text-foreground tabular-nums leading-none mt-2">
                  {confirmationPct}%
                </p>
                <p className="text-[12px] text-muted mt-1">
                  {confirmedSlotsRes.count ?? 0} of {totalSlots} slots confirmed
                </p>
              </div>
              <CalendarCheck className="h-4 w-4 text-faint" />
            </div>
            <ProgressBar value={confirmationPct} tone={confirmationPct >= 80 ? "success" : "warning"} />
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
              <Mini label="Confirmed" value={confirmedSlotsRes.count ?? 0} />
              <Mini label="Pending" value={unconfirmedSlotsRes.count ?? 0} tone={(unconfirmedSlotsRes.count ?? 0) > 0 ? "warning" : "default"} />
              <Mini label="Total" value={totalSlots} />
            </div>
          </Card>
        </div>

        {/* Sub-team load */}
        <Card>
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div>
              <h2 className="text-[13px] font-semibold text-foreground">Sub-team request load</h2>
              <p className="text-[11.5px] text-faint">Requests received per sub-team (last 28 days)</p>
            </div>
            <Link href="/sub-teams" className="text-[12px] font-medium text-muted hover:text-foreground transition-colors inline-flex items-center gap-1">
              All sub-teams <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {subTeamActivity.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-faint">No sub-teams to compare yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {subTeamActivity.map((st) => {
                const max = Math.max(...subTeamActivity.map((s) => s.count), 1)
                const pct = Math.round((st.count / max) * 100)
                return (
                  <li key={st.id}>
                    <Link
                      href={`/sub-teams?id=${st.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-surface-hover transition-colors"
                    >
                      <span className="text-[13px] font-medium text-foreground w-32 truncate">{st.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-surface-subtle overflow-hidden">
                        <div
                          className="h-full rounded-full bg-foreground/70 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[12px] font-medium text-muted tabular-nums w-8 text-right">
                        {st.count}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function KpiCard({
  label, value, href, Icon, tone = "neutral", sub, trend,
}: {
  label: string
  value: number
  href: string
  Icon: React.ComponentType<{ className?: string }>
  tone?: "neutral" | "warning" | "danger" | "info"
  sub?: string
  trend?: { value: number; label: string; up: boolean }
}) {
  return (
    <Link href={href}>
      <Card variant="interactive" className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">{label}</p>
            <p className="mt-2 text-[26px] font-semibold tabular-nums text-foreground leading-none">
              {value}
            </p>
            {sub && <p className="mt-1 text-[11.5px] text-muted">{sub}</p>}
            {trend && (
              <p className={cn(
                "mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
                trend.up ? "text-success" : "text-faint"
              )}>
                {trend.up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {trend.value} {trend.label}
              </p>
            )}
          </div>
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border",
              tone === "warning" && "bg-warning-soft border-warning/20 text-warning",
              tone === "danger" && "bg-danger-soft border-danger/20 text-danger",
              tone === "info" && "bg-info-soft border-info/20 text-info",
              tone === "neutral" && "bg-surface-subtle border-border text-faint"
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </Card>
    </Link>
  )
}

function ProgressBar({ value, tone = "default" }: { value: number; tone?: "default" | "success" | "warning" }) {
  return (
    <div className="relative h-2 w-full rounded-full bg-surface-subtle overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          tone === "success" && "bg-success",
          tone === "warning" && "bg-warning",
          tone === "default" && "bg-foreground"
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

function Mini({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "warning" }) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-faint">{label}</p>
      <p className={cn("text-[15px] font-semibold tabular-nums leading-none mt-1",
        tone === "warning" && "text-warning",
        tone === "default" && "text-foreground"
      )}>
        {value}
      </p>
    </div>
  )
}
