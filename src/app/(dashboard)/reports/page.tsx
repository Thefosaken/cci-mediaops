import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Inbox, CalendarCheck, Wrench, AlertTriangle, BarChart3, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import Link from "next/link"

export default async function ReportsPage() {
  await requireAuth()
  const supabase = await createClient()

  const [pendingReqs, unconfirmedSlots, equipmentIssues, openIncidents, events] = await Promise.all([
    supabase.from("requests").select("*", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
    supabase.from("schedule_slots").select("*", { count: "exact", head: true }).eq("confirmation_status", "pending"),
    supabase.from("equipment_items").select("*", { count: "exact", head: true }).in("condition_status", ["faulty", "missing", "under_repair"]),
    supabase.from("incidents").select("*", { count: "exact", head: true }).in("status", ["open", "investigating"]),
    supabase.from("events").select("*"),
  ])

  const totalEvents     = events.data?.length ?? 0
  const completedEvents = events.data?.filter((e) => e.status === "completed").length ?? 0
  const completionPct   = totalEvents > 0 ? Math.round((completedEvents / totalEvents) * 100) : 0

  const statCards = [
    { title: "Pending Requests",   value: pendingReqs.count    ?? 0, Icon: Inbox,        href: "/requests",  iconClass: "bg-warning-soft text-warning", alert: (pendingReqs.count ?? 0) > 0 },
    { title: "Unconfirmed Slots",  value: unconfirmedSlots.count ?? 0, Icon: CalendarCheck, href: "/scheduling",iconClass: "bg-info-soft text-info",       alert: false },
    { title: "Equipment Issues",   value: equipmentIssues.count ?? 0, Icon: Wrench,       href: "/equipment", iconClass: "bg-danger-soft text-danger",   alert: (equipmentIssues.count ?? 0) > 0 },
    { title: "Open Incidents",     value: openIncidents.count   ?? 0, Icon: AlertTriangle, href: "/incidents", iconClass: "bg-danger-soft text-danger",   alert: (openIncidents.count ?? 0) > 0 },
  ]

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Reports</h1>
        <p className="text-sm text-muted mt-0.5">Operational health overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ title, value, Icon, href, iconClass, alert }) => (
          <Link key={title} href={href} className="group block">
            <Card className="transition-colors hover:border-border-strong">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted">{title}</p>
                    <p className={cn("text-2xl font-bold tabular-nums", alert ? "text-foreground" : "text-foreground")}>
                      {value}
                    </p>
                  </div>
                  <div className={cn("rounded-lg p-2.5", iconClass)}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Detail cards */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Service readiness */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary-soft p-2">
                <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <CardTitle>Service Readiness</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-muted">
                  {completedEvents} of {totalEvents} events completed
                </p>
                <p className="text-lg font-bold text-foreground tabular-nums">{completionPct}%</p>
              </div>

              {/* Progress track */}
              <div
                className="relative h-1.5 w-full rounded-full bg-surface-subtle overflow-hidden"
                role="progressbar"
                aria-valuenow={completionPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Event completion"
              >
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${completionPct}%` }}
                />
              </div>

              {completionPct === 100 && (
                <p className="text-xs text-success flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  All events completed
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Action summary */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-warning-soft p-2">
                <Inbox className="h-4 w-4 text-warning" aria-hidden="true" />
              </div>
              <CardTitle>Action Required</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {[
                {
                  label: "Requests need attention",
                  count: pendingReqs.count ?? 0,
                  href: "/requests",
                  alert: (pendingReqs.count ?? 0) > 0,
                },
                {
                  label: "Schedule slots unconfirmed",
                  count: unconfirmedSlots.count ?? 0,
                  href: "/scheduling",
                  alert: false,
                },
                {
                  label: "Equipment issues",
                  count: equipmentIssues.count ?? 0,
                  href: "/equipment",
                  alert: (equipmentIssues.count ?? 0) > 0,
                },
                {
                  label: "Open incidents",
                  count: openIncidents.count ?? 0,
                  href: "/incidents",
                  alert: (openIncidents.count ?? 0) > 0,
                },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between rounded-lg px-3 py-2 -mx-3 hover:bg-surface-subtle transition-colors group"
                  >
                    <span className="text-sm text-muted group-hover:text-foreground transition-colors">{item.label}</span>
                    <span className={cn(
                      "text-sm font-semibold tabular-nums",
                      item.alert ? "text-foreground" : "text-faint"
                    )}>
                      {item.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
