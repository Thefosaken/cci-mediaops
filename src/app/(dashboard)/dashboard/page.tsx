import Link from "next/link"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import {
  getUpcomingEvents,
  getPendingRequests,
  getEquipmentWithIssues,
  getOpenIncidents,
  getUnconfirmedAssignments,
} from "@/server/queries"
import { getShellCounts } from "@/server/queries/shell"
import { getOnboardingState, buildChecklist } from "@/server/queries/onboarding"
import { WelcomeModal } from "@/components/onboarding/welcome-modal"
import { GettingStarted } from "@/components/onboarding/getting-started"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import {
  CalendarDays,
  Inbox,
  Wrench,
  AlertTriangle,
  ArrowRight,
  MapPin,
  CalendarCheck,
  ClipboardCheck,
  Plus,
  ChevronRight,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { format, isToday, isTomorrow, isThisWeek } from "date-fns"

export const dynamic = "force-dynamic"

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function whenLabel(date: string): string {
  const d = new Date(date)
  if (isToday(d)) return `Today · ${format(d, "h:mm a")}`
  if (isTomorrow(d)) return `Tomorrow · ${format(d, "h:mm a")}`
  if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, "EEEE · h:mm a")
  return format(d, "MMM d · h:mm a")
}

export default async function DashboardPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const [events, requests, issues, incidents, myAssignments, counts, onboarding] = await Promise.all([
    getUpcomingEvents(6),
    getPendingRequests(),
    getEquipmentWithIssues(),
    getOpenIncidents(),
    getUnconfirmedAssignments(),
    getShellCounts(user.id),
    getOnboardingState(user.id),
  ])

  // Welcome flow gating: first sign-in (no onboarded_at) OR checklist still has incomplete items
  const showWelcomeModal = !onboarding.onboardedAt
  const checklistItems = buildChecklist(onboarding)
  const showChecklist =
    !onboarding.onboardedAt || checklistItems.some((i) => !i.done)

  // My pending personal assignments (not all unconfirmed)
  const mine = (myAssignments ?? []).filter((s) => s.assigned_user_id === user.id).slice(0, 5)

  // Today's events
  const todays = events.filter((e) => isToday(new Date(e.start_time)))

  const firstName = (user.full_name ?? "").split(" ")[0] || user.full_name || "there"

  const summaryCards = [
    {
      title: "Upcoming",
      label: "events",
      value: events.length,
      Icon: CalendarDays,
      href: "/calendar",
      tone: "neutral" as const,
    },
    {
      title: "Pending",
      label: "requests",
      value: counts.pendingRequests,
      Icon: Inbox,
      href: "/requests",
      tone: counts.pendingRequests > 0 ? "warning" : "neutral",
    },
    {
      title: "My approvals",
      label: "waiting",
      value: counts.pendingApprovals,
      Icon: ClipboardCheck,
      href: "/approvals",
      tone: counts.pendingApprovals > 0 ? "info" : "neutral",
    },
    {
      title: "Equipment",
      label: "issues",
      value: issues.length,
      Icon: Wrench,
      href: "/equipment",
      tone: issues.length > 0 ? "danger" : "neutral",
    },
  ]

  // Fetch top sub-team activity for "this week" indicator
  const { data: subTeams } = await supabase
    .from("sub_teams")
    .select("id, name, status")
    .eq("status", "active")
    .order("name")
    .limit(7)

  return (
    <div className="flex flex-col">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={
          (counts.pendingRequests + counts.unconfirmedAssignments + counts.openIncidents > 0)
            ? `You have ${counts.pendingRequests} pending requests, ${counts.unconfirmedAssignments} unconfirmed assignments, and ${counts.openIncidents} open incidents.`
            : "All caught up. Nothing pending across your sub-teams."
        }
        badge={
          <Badge variant="muted" size="sm">
            {format(new Date(), "EEEE, MMMM d")}
          </Badge>
        }
        actions={
          <>
            <Link href="/calendar?new=1">
              <Button variant="secondary" size="sm">
                <Plus className="h-3.5 w-3.5" /> Event
              </Button>
            </Link>
            <Link href="/requests?new=1">
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" /> Request
              </Button>
            </Link>
          </>
        }
      />

      <WelcomeModal name={user.full_name} shouldShow={showWelcomeModal} />

      <div className="px-5 sm:px-6 py-6 space-y-6">
        {showChecklist && <GettingStarted items={checklistItems} />}

        {/* Summary stat cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map(({ title, label, value, Icon, href, tone }) => (
            <Link key={title} href={href} className="group">
              <Card variant="interactive" className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-medium uppercase tracking-wider text-faint">
                      {title}
                    </p>
                    <p className="mt-2 text-[26px] font-semibold tracking-tight text-foreground tabular-nums leading-none">
                      {value}
                    </p>
                    <p className="mt-1 text-[12px] text-muted">{label}</p>
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
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1 text-[11.5px] text-faint group-hover:text-muted transition-colors">
                  View
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {/* Today's services callout */}
        {todays.length > 0 && (
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border bg-primary-soft/40 px-5 py-2.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span className="text-[12px] font-semibold text-primary uppercase tracking-wider">
                Happening today
              </span>
            </div>
            <ul className="divide-y divide-border">
              {todays.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/calendar?id=${event.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-hover transition-colors group"
                  >
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md bg-surface border border-border text-foreground leading-none">
                      <span className="text-[8.5px] font-semibold uppercase tracking-wider text-faint">
                        {format(new Date(event.start_time), "MMM")}
                      </span>
                      <span className="text-[14px] font-semibold tabular-nums">
                        {format(new Date(event.start_time), "d")}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-foreground truncate">{event.title}</p>
                      <p className="text-[12px] text-muted flex items-center gap-1.5 mt-0.5">
                        <span className="tabular-nums">{format(new Date(event.start_time), "h:mm a")}</span>
                        {event.location && (
                          <>
                            <span className="text-faint">·</span>
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            <span className="truncate">{event.location}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <StatusBadge status={event.status ?? "planning"} size="sm" />
                    <ChevronRight className="h-4 w-4 text-faint group-hover:text-foreground transition-colors" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Main grid */}
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Upcoming services (col 2) */}
          <Card className="lg:col-span-2">
            <SectionTitle
              title="Upcoming services"
              count={events.length}
              href="/calendar"
              hrefLabel="View calendar"
            />
            {events.length === 0 ? (
              <CardContent>
                <EmptyState
                  variant="compact"
                  icon={<CalendarDays />}
                  title="No upcoming services"
                  description="Create a service or event to start planning."
                  action={{ label: "New event", href: "/calendar?new=1" }}
                />
              </CardContent>
            ) : (
              <ul className="divide-y divide-border">
                {events.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/calendar?id=${event.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-surface-hover transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium text-foreground truncate">{event.title}</p>
                        <p className="text-[12px] text-muted flex items-center gap-1.5">
                          <span className="tabular-nums">{whenLabel(event.start_time)}</span>
                          {event.location && (
                            <>
                              <span className="text-faint">·</span>
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              <span className="truncate">{event.location}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <StatusBadge status={event.status ?? "planning"} size="sm" />
                      <ChevronRight className="h-3.5 w-3.5 text-faint group-hover:text-foreground transition-colors" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* My assignments */}
          <Card>
            <SectionTitle
              title="Your assignments"
              count={mine.length}
              href="/scheduling"
              hrefLabel="View all"
            />
            {mine.length === 0 ? (
              <CardContent>
                <EmptyState
                  variant="compact"
                  icon={<CalendarCheck />}
                  title="Nothing to confirm"
                  description="Assignments needing your confirmation will appear here."
                />
              </CardContent>
            ) : (
              <ul className="divide-y divide-border">
                {mine.map((slot) => {
                  const ev = (slot as unknown as { events?: { title?: string; start_time?: string } }).events
                  return (
                    <li key={slot.id} className="px-5 py-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-foreground truncate">
                            {slot.role_title}
                          </p>
                          <p className="text-[12px] text-muted truncate mt-0.5">
                            {ev?.title} {ev?.start_time && `· ${whenLabel(ev.start_time)}`}
                          </p>
                        </div>
                        <StatusBadge status={slot.confirmation_status ?? "pending"} size="sm" />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* Second row */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Pending requests */}
          <Card>
            <SectionTitle
              title="Pending requests"
              count={requests.length}
              href="/requests"
              hrefLabel="Inbox"
            />
            {requests.length === 0 ? (
              <CardContent>
                <EmptyState
                  variant="compact"
                  icon={<Inbox />}
                  title="Inbox zero"
                  description="No pending requests across all sub-teams."
                />
              </CardContent>
            ) : (
              <ul className="divide-y divide-border">
                {requests.slice(0, 6).map((req) => (
                  <li key={req.id}>
                    <Link
                      href={`/requests?id=${req.id}`}
                      className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-hover transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-foreground truncate">{req.title}</p>
                        <p className="text-[11.5px] text-muted truncate mt-0.5">
                          {req.requesting_unit ?? "Unknown unit"}
                          {req.priority && req.priority !== "normal" && (
                            <span
                              className={cn(
                                "ml-1.5 font-medium uppercase tracking-wider text-[10.5px]",
                                req.priority === "urgent" && "text-danger",
                                req.priority === "high" && "text-warning"
                              )}
                            >
                              · {req.priority}
                            </span>
                          )}
                        </p>
                      </div>
                      <StatusBadge status={req.status} size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Operational alerts */}
          <Card>
            <SectionTitle
              title="Operational alerts"
              count={incidents.length + issues.length}
              href="/incidents"
              hrefLabel="All incidents"
            />
            {incidents.length === 0 && issues.length === 0 ? (
              <CardContent>
                <EmptyState
                  variant="compact"
                  icon={<AlertTriangle />}
                  title="All clear"
                  description="No incidents and no equipment in faulty status."
                />
              </CardContent>
            ) : (
              <ul className="divide-y divide-border">
                {incidents.slice(0, 3).map((inc) => (
                  <li key={inc.id}>
                    <Link
                      href={`/incidents?id=${inc.id}`}
                      className="flex items-start gap-3 px-5 py-2.5 hover:bg-surface-hover transition-colors"
                    >
                      <AlertTriangle
                        className={cn(
                          "h-3.5 w-3.5 mt-0.5 shrink-0",
                          inc.severity === "critical" || inc.severity === "high"
                            ? "text-danger"
                            : "text-warning"
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-foreground line-clamp-1">
                          {inc.incident_type ?? "Incident"}
                        </p>
                        <p className="text-[11.5px] text-muted line-clamp-1 mt-0.5">
                          {inc.description}
                        </p>
                      </div>
                      <StatusBadge status={inc.status} size="sm" />
                    </Link>
                  </li>
                ))}
                {issues.slice(0, 3).map((eq) => (
                  <li key={eq.id}>
                    <Link
                      href={`/equipment?id=${eq.id}`}
                      className="flex items-start gap-3 px-5 py-2.5 hover:bg-surface-hover transition-colors"
                    >
                      <Wrench className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-foreground line-clamp-1">{eq.name}</p>
                        <p className="text-[11.5px] text-muted line-clamp-1 mt-0.5">
                          {eq.category ?? "Equipment"}
                          {eq.asset_tag && ` · ${eq.asset_tag}`}
                        </p>
                      </div>
                      <StatusBadge status={eq.condition_status ?? "good"} size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Sub-teams strip */}
        {subTeams && subTeams.length > 0 && (
          <Card>
            <SectionTitle title="Sub-teams" href="/sub-teams" hrefLabel="Manage teams" />
            <div className="px-5 pb-5 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-7">
              {subTeams.map((team) => (
                <Link
                  key={team.id}
                  href={`/sub-teams?id=${team.id}`}
                  className="rounded-md border border-border bg-surface hover:bg-surface-hover hover:border-border-strong transition-colors px-3 py-2.5 text-center group"
                >
                  <div className="text-[12.5px] font-medium text-foreground truncate">
                    {team.name}
                  </div>
                  <div className="text-[10.5px] text-faint mt-0.5">Active</div>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function SectionTitle({
  title,
  count,
  href,
  hrefLabel,
}: {
  title: string
  count?: number
  href?: string
  hrefLabel?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
      <div className="flex items-center gap-2 min-w-0">
        <h2 className="text-[13px] font-semibold text-foreground tracking-tight">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="text-[11.5px] font-medium text-faint tabular-nums">{count}</span>
        )}
      </div>
      {href && (
        <Link
          href={href}
          className="inline-flex items-center gap-0.5 text-[12px] font-medium text-muted hover:text-foreground transition-colors"
        >
          {hrefLabel ?? "View all"}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
