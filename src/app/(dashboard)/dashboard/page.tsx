import { requireAuth, getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { getUpcomingEvents, getPendingRequests, getEquipmentWithIssues, getOpenIncidents } from "@/server/queries"
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { CalendarDays, Inbox, Wrench, AlertTriangle, ArrowRight, MapPin } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils/cn"

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
      accent: "border-l-info",
      iconBg: "bg-info-soft text-info",
    },
    {
      title: "Pending Requests",
      value: requests.length,
      icon: Inbox,
      href: "/requests",
      accent: "border-l-warning",
      iconBg: "bg-warning-soft text-warning",
    },
    {
      title: "Equipment Issues",
      value: issues.length,
      icon: Wrench,
      href: "/equipment",
      accent: "border-l-danger",
      iconBg: "bg-danger-soft text-danger",
    },
    {
      title: "Open Incidents",
      value: incidents.length,
      icon: AlertTriangle,
      href: "/incidents",
      accent: "border-l-danger",
      iconBg: "bg-danger-soft text-danger",
    },
  ]

  // Event status → badge variant mapping
  function eventBadgeVariant(status: string) {
    switch (status) {
      case "confirmed": return "success" as const
      case "live": return "info" as const
      case "completed": return "muted" as const
      case "cancelled": return "danger" as const
      default: return "warning" as const
    }
  }

  // Request status → badge variant mapping
  function reqBadgeVariant(status: string) {
    switch (status) {
      case "in_progress": return "info" as const
      case "completed": return "success" as const
      case "rejected":
      case "cancelled": return "danger" as const
      case "under_review": return "info" as const
      default: return "warning" as const
    }
  }

  // Month abbreviation + day for event date badge
  function DateBadge({ date }: { date: string }) {
    const d = new Date(date)
    const month = d.toLocaleDateString("en-US", { month: "short" })
    const day = d.getDate()
    return (
      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-soft text-primary leading-none">
        <span className="text-[9px] font-bold uppercase tracking-wider">{month}</span>
        <span className="text-sm font-bold leading-tight">{day}</span>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted">
            Welcome back,{" "}
            <span className="font-medium text-foreground">{user.full_name}</span>
            {" · "}
            <Badge variant="muted" dot className="ml-0.5">
              {roleName.replace(/_/g, " ")}
            </Badge>
          </p>
        </div>
        <p className="hidden sm:block text-xs text-faint tabular-nums">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Link key={card.title} href={card.href} className="group block">
            <div
              className={cn(
                "relative rounded-xl border border-border bg-surface shadow-sm overflow-hidden",
                "transition-all duration-150 hover:shadow-md hover:border-border-strong",
                "border-l-[3px]",
                card.accent
              )}
            >
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                      {card.title}
                    </p>
                    <p className="text-3xl font-bold text-foreground tabular-nums">
                      {card.value}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "rounded-lg p-2.5 transition-colors duration-150",
                      card.iconBg
                    )}
                  >
                    <card.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs text-muted group-hover:text-foreground transition-colors">
                  <span>View all</span>
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming Events */}
        <Card>
          <CardHeader className="flex-row items-center">
            <CardTitle>Upcoming Events</CardTitle>
            <CardAction>
              <Link
                href="/calendar"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground transition-colors"
              >
                View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="h-6 w-6" />}
                title="No upcoming events"
                description="Create an event in the calendar to get started"
              />
            ) : (
              <ul className="space-y-0.5">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-subtle transition-colors duration-100 -mx-3 group"
                  >
                    <DateBadge date={event.start_time} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {event.title}
                      </p>
                      <p className="text-xs text-muted flex items-center gap-1">
                        {new Date(event.start_time).toLocaleDateString("en-US", {
                          weekday: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {event.location && (
                          <>
                            <span aria-hidden="true">·</span>
                            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{event.location}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <Badge variant={eventBadgeVariant(event.status ?? "")} dot>
                      {(event.status ?? "upcoming").replace(/_/g, " ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Pending Requests */}
        <Card>
          <CardHeader className="flex-row items-center">
            <CardTitle>Pending Requests</CardTitle>
            <CardAction>
              <Link
                href="/requests"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground transition-colors"
              >
                View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-6 w-6" />}
                title="No pending requests"
                description="Media requests will appear here when submitted"
              />
            ) : (
              <ul className="space-y-0.5">
                {requests.map((req) => (
                  <li
                    key={req.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-subtle transition-colors duration-100 -mx-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {req.title}
                      </p>
                      <p className="text-xs text-muted truncate">
                        {req.requesting_unit || "Unknown unit"}
                        {req.priority && req.priority !== "normal" && (
                          <> · <span className={cn(
                            "font-medium",
                            req.priority === "urgent" && "text-danger",
                            req.priority === "high" && "text-warning"
                          )}>{req.priority}</span></>
                        )}
                      </p>
                    </div>
                    <Badge variant={reqBadgeVariant(req.status)} dot>
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
