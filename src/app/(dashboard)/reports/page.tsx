import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

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

  const totalEvents = events.data?.length ?? 0
  const completedEvents = events.data?.filter((e) => e.status === "completed").length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted">Operational health overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ReportCard title="Pending Requests" value={pendingReqs.count?.toString() ?? "0"} />
        <ReportCard title="Unconfirmed Slots" value={unconfirmedSlots.count?.toString() ?? "0"} />
        <ReportCard title="Equipment Issues" value={equipmentIssues.count?.toString() ?? "0"} />
        <ReportCard title="Open Incidents" value={openIncidents.count?.toString() ?? "0"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Service Readiness</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted">
              {completedEvents} of {totalEvents} events completed
            </p>
            <div className="mt-2 h-2 w-full rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: totalEvents > 0 ? `${(completedEvents / totalEvents) * 100}%` : "0%" }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Request Summary</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted">
              {pendingReqs.count} requests need attention
            </p>
            <p className="text-sm text-muted mt-1">
              {unconfirmedSlots.count} schedule slots unconfirmed
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ReportCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-surface p-6 text-foreground shadow-sm">
      <p className="text-sm font-medium text-muted">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  )
}
