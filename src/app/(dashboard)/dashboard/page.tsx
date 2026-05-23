import { requireAuth, getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { getUpcomingEvents, getPendingRequests, getUnconfirmedAssignments, getEquipmentWithIssues, getOpenIncidents, getUserNotifications } from "@/server/queries"

export default async function DashboardPage() {
  const user = await requireAuth()
  const userWithRole = await getCurrentUserWithRole()

  const [events, requests, issues, incidents] = await Promise.all([
    getUpcomingEvents(5),
    getPendingRequests(),
    getEquipmentWithIssues(),
    getOpenIncidents(),
  ])

  const roleName = userWithRole?.campus_memberships?.[0]?.roles?.name ?? "team_member"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back, {user.full_name}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardCard title="Upcoming Events" value={events.length.toString()} />
        <DashboardCard title="Pending Requests" value={requests.length.toString()} />
        <DashboardCard title="Equipment Issues" value={issues.length.toString()} />
        <DashboardCard title="Open Incidents" value={incidents.length.toString()} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <h2 className="font-semibold mb-4">Upcoming Events</h2>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming events</p>
          ) : (
            <ul className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{event.title}</span>
                  <span className="text-muted-foreground">
                    {new Date(event.start_time).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border bg-card p-6">
          <h2 className="font-semibold mb-4">Pending Requests</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending requests</p>
          ) : (
            <ul className="space-y-3">
              {requests.map((req) => (
                <li key={req.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{req.title}</span>
                  <span className="text-muted-foreground capitalize">{req.status.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function DashboardCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  )
}
