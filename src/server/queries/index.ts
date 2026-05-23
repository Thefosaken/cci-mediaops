import { createClient } from "@/lib/supabase/server"
import type { Event, Request, ScheduleSlot, Task, EquipmentItem, Incident, Notification } from "@/types"

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

export async function getUnconfirmedAssignments(subTeamId?: string) {
  const supabase = await createClient()
  let query = supabase
    .from("schedule_slots")
    .select("*, events!inner(*)")
    .eq("confirmation_status", "pending")
    .order("created_at", { ascending: false })

  if (subTeamId) query = query.eq("sub_team_id", subTeamId)

  const { data } = await query
  return (data ?? []) as (ScheduleSlot & { events: Event })[]
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
