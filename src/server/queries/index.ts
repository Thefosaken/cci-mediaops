import { createClient } from "@/lib/supabase/server"
import type { Event, Request, Task, EquipmentItem, Incident, Notification } from "@/types"

export async function getUpcomingEvents(limit = 10) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("events")
    .select("*")
    .gte("start_time", new Date().toISOString())
    .order("start_time", { ascending: true })
    .limit(limit)
  return (data ?? []) as Event[]
}

export async function getPendingRequests() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("requests")
    .select("*")
    .in("status", ["submitted", "under_review", "clarification_needed"])
    .order("created_at", { ascending: false })
  return (data ?? []) as Request[]
}

/**
 * One row of "your assignments".
 *
 * Two different things land here and a member shouldn't have to care which: a duty
 * (you're on Sound this Sunday) and a run sheet session (you're on this item of that
 * service). `kind` keeps them distinguishable for links and labels.
 */
export interface MyAssignment {
  id: string
  kind: "duty" | "session"
  role_title: string | null
  call_time: string | null
  /** Session name, or the team name for a duty. */
  title: string
  /** When it happens — session start, or the duty's date. */
  when: string | null
  /** Run sheet title, or the service/date context for a duty. */
  context: string
}

/**
 * Sessions this user is rostered on and has not yet responded to.
 *
 * Replaces the old schedule_slots read. Two differences worth noting: the filter by user
 * happens in the query rather than in the page (the dashboard used to fetch every
 * unconfirmed assignment on the campus and discard most of them), and the label now
 * comes from the session and its run sheet rather than an event, since a run sheet no
 * longer requires one.
 */
export async function getMyAssignments(userId: string, limit = 5): Promise<MyAssignment[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: sessionRows }, { data: dutyRows }] = await Promise.all([
    supabase
      .from("run_sheet_session_members")
      .select(
        "id, role_title, call_time, run_sheet_sessions!inner(name, start_time, run_sheets!inner(title))"
      )
      .eq("user_id", userId)
      .eq("confirmation_status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit),
    // Past duties are history, not something to action, so only today onward.
    supabase
      .from("duty_assignments")
      .select("id, role_title, call_time, duty_date, status, sub_teams:sub_team_id(name), events:event_id(title)")
      .eq("user_id", userId)
      .in("status", ["scheduled", "confirmed"])
      .gte("duty_date", today)
      .order("duty_date")
      .limit(limit),
  ])

  // Supabase types joined relations as arrays even when the FK is single — see CLAUDE.md.
  type SessionRow = {
    id: string
    role_title: string | null
    call_time: string | null
    run_sheet_sessions: {
      name: string
      start_time: string | null
      run_sheets: { title: string }
    }
  }
  type DutyRow = {
    id: string
    role_title: string | null
    call_time: string | null
    duty_date: string
    status: string
    sub_teams: { name: string } | null
    events: { title: string } | null
  }

  const sessions: MyAssignment[] = ((sessionRows ?? []) as unknown as SessionRow[]).map((r) => ({
    id: r.id,
    kind: "session",
    role_title: r.role_title,
    call_time: r.call_time,
    title: r.run_sheet_sessions.name,
    when: r.run_sheet_sessions.start_time,
    context: r.run_sheet_sessions.run_sheets.title,
  }))

  const duties: MyAssignment[] = ((dutyRows ?? []) as unknown as DutyRow[]).map((r) => ({
    id: r.id,
    kind: "duty",
    role_title: r.role_title,
    call_time: r.call_time,
    title: r.sub_teams?.name ?? "Duty",
    // Midday, so rendering in a local timezone can't shift a date-only duty a day.
    when: `${r.duty_date}T12:00:00`,
    context: r.events?.title ?? "Scheduled duty",
  }))

  // Soonest first, so the next thing you're on is at the top whichever kind it is.
  return [...duties, ...sessions]
    .sort((a, b) => (a.when ?? "").localeCompare(b.when ?? ""))
    .slice(0, limit)
}

export async function getTasksForUser(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("assigned_user_id", userId)
    .not("status", "in", '("completed","cancelled")')
    .order("due_date", { ascending: true })
  return (data ?? []) as Task[]
}

export async function getEquipmentBySubTeam(subTeamId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("equipment_items")
    .select("*")
    .eq("sub_team_id", subTeamId)
    .order("name")
  return (data ?? []) as EquipmentItem[]
}

export async function getEquipmentWithIssues() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("equipment_items")
    .select("*")
    .in("condition_status", ["faulty", "missing", "under_repair"])
    .order("updated_at", { ascending: false })
  return (data ?? []) as EquipmentItem[]
}

export async function getOpenIncidents() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("incidents")
    .select("*")
    .in("status", ["open", "investigating"])
    .order("created_at", { ascending: false })
  return (data ?? []) as Incident[]
}

export async function getUserNotifications(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
  return (data ?? []) as Notification[]
}

export async function getPendingApprovals(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("approvals")
    .select("*, requests!left(*), tasks!left(*)")
    .eq("approver_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
  return data ?? []
}

export async function getSubTeamWithMembers(subTeamId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("sub_teams")
    .select("*, sub_team_memberships(users(*), roles(*))")
    .eq("id", subTeamId)
    .single()
  return data
}

export async function getRoleIdByName(name: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("roles")
    .select("id")
    .eq("name", name)
    .single()
  return data?.id
}
