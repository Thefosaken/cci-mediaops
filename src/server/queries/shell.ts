import { createClient } from "@/lib/supabase/server"

export interface ShellCounts {
  pendingRequests: number
  pendingApprovals: number
  unconfirmedAssignments: number
  openIncidents: number
  equipmentIssues: number
  unreadNotifications: number
}

export interface ShellNotification {
  id: string
  type: string
  title: string
  body: string | null
  entity_type: string | null
  entity_id: string | null
  read_at: string | null
  created_at: string
}

/**
 * Fetches all sidebar badge counts + unread notification count in a single helper.
 * Designed for the dashboard layout — falls back to zeros if the user is missing.
 */
export async function getShellCounts(userId?: string | null): Promise<ShellCounts> {
  const supabase = await createClient()

  const pendingRequestsQuery = supabase
    .from("requests")
    .select("id", { count: "exact", head: true })
    .in("status", ["submitted", "under_review", "clarification_needed"])

  const pendingApprovalsQuery = userId
    ? supabase
        .from("approvals")
        .select("id", { count: "exact", head: true })
        .eq("approver_id", userId)
        .eq("status", "pending")
    : Promise.resolve({ count: 0 } as { count: number | null })

  const unconfirmedAssignmentsQuery = userId
    ? supabase
        .from("schedule_slots")
        .select("id", { count: "exact", head: true })
        .eq("assigned_user_id", userId)
        .eq("confirmation_status", "pending")
    : Promise.resolve({ count: 0 } as { count: number | null })

  const openIncidentsQuery = supabase
    .from("incidents")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "investigating"])

  const equipmentIssuesQuery = supabase
    .from("equipment_items")
    .select("id", { count: "exact", head: true })
    .in("condition_status", ["faulty", "missing", "under_repair"])

  const unreadNotificationsQuery = userId
    ? supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null)
    : Promise.resolve({ count: 0 } as { count: number | null })

  const [
    pendingRequests,
    pendingApprovals,
    unconfirmedAssignments,
    openIncidents,
    equipmentIssues,
    unreadNotifications,
  ] = await Promise.all([
    pendingRequestsQuery,
    pendingApprovalsQuery,
    unconfirmedAssignmentsQuery,
    openIncidentsQuery,
    equipmentIssuesQuery,
    unreadNotificationsQuery,
  ])

  return {
    pendingRequests: pendingRequests.count ?? 0,
    pendingApprovals: pendingApprovals.count ?? 0,
    unconfirmedAssignments: unconfirmedAssignments.count ?? 0,
    openIncidents: openIncidents.count ?? 0,
    equipmentIssues: equipmentIssues.count ?? 0,
    unreadNotifications: unreadNotifications.count ?? 0,
  }
}

/** Recent notifications for the navbar dropdown (15 most recent, unread first). */
export async function getRecentNotifications(userId: string): Promise<ShellNotification[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, entity_type, entity_id, read_at, created_at")
    .eq("user_id", userId)
    .order("read_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(15)

  return (data ?? []) as ShellNotification[]
}
