import { createClient } from "@/lib/supabase/server"

export type NotificationType =
  | "user_invited"
  | "user_approved"
  | "user_assigned"
  | "task_assigned"
  | "confirmation_required"
  | "assignment_declined"
  | "request_submitted"
  | "request_assigned"
  | "clarification_requested"
  | "deadline_approaching"
  | "approval_requested"
  | "changes_requested"
  | "equipment_assigned"
  | "equipment_overdue"
  | "event_updated"

export async function createNotification({
  userId,
  type,
  title,
  body,
  entityType,
  entityId,
}: {
  userId: string
  type: NotificationType
  title: string
  body?: string
  entityType: "request" | "task" | "equipment" | "incident" | "event"
  entityId: string
}) {
  const supabase = await createClient()

  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type,
    title,
    body,
    entity_type: entityType,
    entity_id: entityId,
  })

  if (error) {
    console.error("Failed to create notification:", error)
  }
}

export async function markAsRead(notificationId: string) {
  const supabase = await createClient()

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
}

export async function getUnreadCount(userId: string) {
  const supabase = await createClient()

  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)

  return count ?? 0
}
