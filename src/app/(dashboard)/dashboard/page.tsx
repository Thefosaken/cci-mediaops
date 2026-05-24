import { requireAuth, getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { getUpcomingEvents, getPendingRequests, getEquipmentWithIssues, getOpenIncidents } from "@/server/queries"
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { CalendarDays, Inbox, Wrench, AlertTriangle, ArrowRight, MapPin } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils/cn"

export default async function DashboardPage() {
  const user         = await requireAuth()
  const userWithRole = await getCurrentUserWithRole()

  const [events, requests, issues, incidents] = await Promise.all([
    getUpcomingEvents(5),
    getPendingRequests(),
    getEquipmentWithIssues(),
    getOpenIncidents(),
  ])

  const roleName = userWithRole?.campus_memberships?.[0]?.roles?.name ?? "team_member"

  // Stat cards — no thick left border, use icon bg as visual signal
  const summaryCards = [
    { title: "Upcoming Events",  value: events.length,   Icon: CalendarDays, href: "/calendar",  iconClass: "bg-info-soft text-info"    },
    { title: "Pending Requests", value: requests.length, Icon: Inbox,        href: "/requests",  iconClass: "bg-warning-soft text-warning" },
    { title: "Equipment Issues", value: issues.length,   Icon: Wrench,       href: "/equipment", iconClass: "bg-danger-soft text-danger"   },
    { title: "Open Incidents",   value: incidents.length,Icon: AlertTriangle, href: "/incidents", iconClass: "bg-danger-soft text-danger"   },
  ]

  function eventBadgeVariant(status: string) {
    switch (status) {
      case "confirmed": return "success" as const
      case "live":      return "info" as const
      case "completed": return "muted" as const
      case "cancelled": return "danger" as const
      default:          return "warning" as const
    }
  }

  function reqBadgeVariant(status: string) {
    switch (status) {
      case "in_progress":       return "info" as const
      case "completed":         return "success" as const
      case "rejected":
      case "cancelled":         return "danger" as const
      case "under_review":      return "info" as const
      default:                  return "warning" as const
    }
  }

  function DateBadge({ date }: { date: string }) {
    const d = new Date(date)
    return (
      <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-soft text-primary leading-none">
        <span className="text-[9px] font-bold uppercase tracking-wider">
          {d.toLocaleDateString("en-US", { month: "short" })}
        </span>
        <span className="text-sm font-bold leading-tight">{d.getDate()}</span>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted">
            Welcome back, <span className="font-medium text-foreground">{user.full_name}</span>
            {" · "}
            <Badge variant="muted" dot>{roleName.replace(/_/g, " ")}</Badge>
          </p>
        </div>
        <p className="hidden sm:block text-xs text-faint tabular-nums">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Stat cards — no heavy left border, icon bg is the visual signal */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(({ title, value, Icon, href, iconClass }) => (
          <Link key={title} href={href} className="group block">
            <Card className="transition-colors duration-150 hover:border-border-strong">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted">{title}</p>
                    <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
                  </div>
                  <div className={cn("rounded-lg p-2.5", iconClass)}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs text-faint group-hover:text-muted transition-colors">
                  View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Upcoming Events */}
        <Card>
          <CardHeader className="flex-row items-center pb-3">
            <CardTitle>Upcoming Events</CardTitle>
            <CardAction>
              <Link href="/calendar" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-0">
            {events.length === 0 ? (
              <EmptyState icon={<CalendarDays className="h-5 w-5" />} title="No upcoming events" description="Create an event in the calendar" />
            ) : (
              <ul className="space-y-0.5">
                {events.map((event) => (
                  <li key={event.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-subtle transition-colors duration-100 -mx-3">
                    <DateBadge date={event.start_time} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
                      <p className="text-xs text-muted flex items-center gap-1">
                        {new Date(event.start_time).toLocaleDateString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                        {event.location && <><span>·</span><MapPin className="h-3 w-3" /><span className="truncate">{event.location}</span></>}
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
          <CardHeader className="flex-row items-center pb-3">
            <CardTitle>Pending Requests</CardTitle>
            <CardAction>
              <Link href="/requests" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-0">
            {requests.length === 0 ? (
              <EmptyState icon={<Inbox className="h-5 w-5" />} title="No pending requests" description="Media requests will appear here" />
            ) : (
              <ul className="space-y-0.5">
                {requests.map((req) => (
                  <li key={req.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-subtle transition-colors duration-100 -mx-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{req.title}</p>
                      <p className="text-xs text-muted truncate">
                        {req.requesting_unit || "Unknown unit"}
                        {req.priority && req.priority !== "normal" && (
                          <span className={cn("ml-1 font-medium", req.priority === "urgent" ? "text-danger" : "text-warning")}>
                            · {req.priority}
                          </span>
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
