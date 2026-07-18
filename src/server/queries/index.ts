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

/** One row of "your assignments" — a session you are on, awaiting your confirmation. */
export interface MyAssignment {
  id: string
  role_title: string | null
  call_time: string | null
  session_name: string
  session_start: string | null
  run_sheet_title: string
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
  const { data } = await supabase
    .from("run_sheet_session_members")
    .select(
      "id, role_title, call_time, run_sheet_sessions!inner(name, start_time, run_sheets!inner(title))"
    )
    .eq("user_id", userId)
    .eq("confirmation_status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit)

  // Supabase types joined relations as arrays even when the FK is single — see CLAUDE.md.
  type Row = {
    id: string
    role_title: string | null
    call_time: string | null
    run_sheet_sessions: {
      name: string
      start_time: string | null
      run_sheets: { title: string }
    }
  }

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    role_title: r.role_title,
    call_time: r.call_time,
    session_name: r.run_sheet_sessions.name,
    session_start: r.run_sheet_sessions.start_time,
    run_sheet_title: r.run_sheet_sessions.run_sheets.title,
  }))
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
