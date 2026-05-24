import { requireAuth, getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { getUpcomingEvents, getPendingRequests, getEquipmentWithIssues, getOpenIncidents } from "@/server/queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CalendarDays, Inbox, Wrench, AlertTriangle, ArrowRight } from "lucide-react"
import Link from "next/link"

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

  const summaryCards = [
    {
      title: "Upcoming Events",
      value: events.length,
      icon: CalendarDays,
      href: "/calendar",
      variant: "default" as const,
    },
    {
      title: "Pending Requests",
      value: requests.length,
      icon: Inbox,
      href: "/requests",
      variant: "warning" as const,
    },
    {
      title: "Equipment Issues",
      value: issues.length,
      icon: Wrench,
      href: "/equipment",
      variant: "danger" as const,
    },
    {
      title: "Open Incidents",
      value: incidents.length,
      icon: AlertTriangle,
      href: "/incidents",
      variant: "info" as const,
    },
  ]

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted">
            Welcome back, <span className="font-medium text-foreground">{user.full_name}</span>
            <Badge variant="muted" className="ml-2">{roleName.replace(/_/g, " ")}</Badge>
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Link key={card.title} href={card.href} className="group block">
            <Card className="transition-all duration-150 hover:shadow-md hover:border-border-strong">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted">{card.title}</p>
                    <p className="text-3xl font-bold text-foreground tabular-nums">{card.value}</p>
                  </div>
                  <div className="rounded-lg bg-surface-subtle p-2.5 text-muted group-hover:text-foreground transition-colors">
                    <card.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming Events */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Upcoming Events</CardTitle>
            <Link href="/calendar" className="text-xs font-medium text-muted hover:text-foreground transition-colors flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CalendarDays className="h-8 w-8 text-muted mb-2" />
                <p className="text-sm text-muted">No upcoming events</p>
                <p className="text-xs text-faint mt-1">Create an event to get started</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-surface-subtle transition-colors -mx-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary text-xs font-bold">
                        {new Date(event.start_time).getDate()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
                        <p className="text-xs text-muted">
                          {new Date(event.start_time).toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <Badge variant="muted">{event.status?.replace(/_/g, " ") || "upcoming"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Pending Requests */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Pending Requests</CardTitle>
            <Link href="/requests" className="text-xs font-medium text-muted hover:text-foreground transition-colors flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Inbox className="h-8 w-8 text-muted mb-2" />
                <p className="text-sm text-muted">No pending requests</p>
                <p className="text-xs text-faint mt-1">Media requests will appear here</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {requests.map((req) => (
                  <li
                    key={req.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-surface-subtle transition-colors -mx-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{req.title}</p>
                        <p className="text-xs text-muted">{req.requesting_unit || "Unknown"}</p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        req.status === "submitted" ? "warning" :
                        req.status === "under_review" ? "info" :
                        req.status === "clarification_needed" ? "warning" :
                        "default"
                      }
                    >
                      {req.status.replace(/_/g, " ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
