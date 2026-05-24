"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import { leadJoinRequestEmail, joinRequestApprovedEmail } from "@/lib/email/templates"

type Result<T = void> =
  | (T extends void ? { success: true } : { success: true; data: T })
  | { success: false; error: string }

/** A user asks to join a sub-team. Creates a pending request. */
export async function requestSubTeamJoin(
  subTeamId: string,
  message?: string
): Promise<Result> {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return { success: false, error: "Not authenticated" }
  const { data: profile } = await supabase
    .from("users").select("id, full_name").eq("auth_user_id", authUser.id).single()
  if (!profile) return { success: false, error: "Profile not found" }

  // Check user isn't already a member
  const { data: existing } = await supabase
    .from("sub_team_memberships").select("id")
    .eq("sub_team_id", subTeamId).eq("user_id", profile.id).maybeSingle()
  if (existing) return { success: false, error: "You're already a member of this sub-team" }

  // Check for existing pending request
  const { data: pending } = await supabase
    .from("sub_team_join_requests").select("id")
    .eq("sub_team_id", subTeamId).eq("user_id", profile.id).eq("status", "pending").maybeSingle()
  if (pending) return { success: false, error: "You already have a pending request to join this team" }

  const { error } = await supabase.from("sub_team_join_requests").insert({
    sub_team_id: subTeamId,
    user_id: profile.id,
    message: message?.trim() || null,
    status: "pending",
  })
  if (error) return { success: false, error: error.message }

  // Notify the sub-team leads (in-app + email)
  await notifyLeadsOfJoinRequest(subTeamId, profile.full_name ?? profile.id)

  revalidatePath("/sub-teams")
  return { success: true }
}

async function notifyLeadsOfJoinRequest(subTeamId: string, requesterName: string) {
  const supabase = await createClient()
  const { data: team } = await supabase
    .from("sub_teams").select("name").eq("id", subTeamId).single()
  if (!team) return

  // Find leads of this sub-team + media admins of the campus
  const { data: leadRole } = await supabase
    .from("roles").select("id").eq("name", "sub_team_lead").single()

  const { data: leads } = leadRole
    ? await supabase
        .from("sub_team_memberships")
        .select("user_id, users:user_id(id, full_name, email)")
        .eq("sub_team_id", subTeamId)
        .eq("role_id", leadRole.id)
        .eq("status", "active")
    : { data: [] }

  // Also notify media admins as a fallback
  const { data: adminRoles } = await supabase
    .from("roles").select("id, name").in("name", ["super_admin", "media_admin"])
  const adminRoleIds = (adminRoles ?? []).map((r) => r.id)
  const { data: admins } = adminRoleIds.length
    ? await supabase
        .from("campus_memberships")
        .select("user_id, users:user_id(id, full_name, email)")
        .in("role_id", adminRoleIds)
        .eq("status", "active")
    : { data: [] }

  const recipients = new Map<string, { full_name: string | null; email: string | null }>()
  for (const row of leads ?? []) {
    const u = (row as unknown as { users?: { id: string; full_name: string | null; email: string | null } }).users
    if (u?.id) recipients.set(u.id, { full_name: u.full_name, email: u.email })
  }
  for (const row of admins ?? []) {
    const u = (row as unknown as { users?: { id: string; full_name: string | null; email: string | null } }).users
    if (u?.id) recipients.set(u.id, { full_name: u.full_name, email: u.email })
  }

  if (recipients.size === 0) return

  // In-app notifications
  const inAppRows = Array.from(recipients.keys()).map((uid) => ({
    user_id: uid,
    type: "user_invited",
    title: `${requesterName} wants to join ${team.name}`,
    body: "Review the request in the sub-team page.",
    entity_type: "sub_team",
    entity_id: subTeamId,
  }))
  if (inAppRows.length) {
    await supabase.from("notifications").insert(inAppRows)
  }

  // Emails (fire and forget)
  await Promise.all(
    Array.from(recipients.values()).map((r) =>
      r.email
        ? sendEmail({
            to: r.email,
            ...leadJoinRequestEmail({
              leadName: r.full_name ?? "there",
              requesterName,
              subTeamName: team.name,
            }),
          })
        : Promise.resolve()
    )
  )
}

export async function approveJoinRequest(requestId: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return { success: false, error: "Not authenticated" }
  const { data: approver } = await supabase
    .from("users").select("id").eq("auth_user_id", authUser.id).single()
  if (!approver) return { success: false, error: "Approver profile not found" }

  const { data: req } = await supabase
    .from("sub_team_join_requests")
    .select("id, sub_team_id, user_id, status, sub_team:sub_team_id(name), user:user_id(full_name, email)")
    .eq("id", requestId)
    .single()
  if (!req) return { success: false, error: "Request not found" }
  if (req.status !== "pending") return { success: false, error: "Already decided" }

  // Default new members to the team_member role
  const { data: memberRole } = await supabase
    .from("roles").select("id").eq("name", "team_member").single()

  // Insert membership (ignore unique-conflict if somehow exists)
  const { error: memErr } = await supabase
    .from("sub_team_memberships")
    .insert({
      sub_team_id: req.sub_team_id,
      user_id: req.user_id,
      role_id: memberRole?.id,
      status: "active",
    })
  if (memErr && !memErr.message.toLowerCase().includes("duplicate")) {
    return { success: false, error: memErr.message }
  }

  const { error: updateErr } = await supabase
    .from("sub_team_join_requests")
    .update({ status: "approved", decided_by: approver.id, decided_at: new Date().toISOString() })
    .eq("id", req.id)
  if (updateErr) return { success: false, error: updateErr.message }

  // Notify the requester
  const teamName =
    (req.sub_team as unknown as { name?: string } | null)?.name ?? "the sub-team"
  const user =
    (req.user as unknown as { full_name?: string | null; email?: string | null } | null) ?? null

  await supabase.from("notifications").insert({
    user_id: req.user_id,
    type: "user_approved",
    title: `You're in ${teamName}`,
    body: "Your join request was approved.",
    entity_type: "sub_team",
    entity_id: req.sub_team_id,
  })

  if (user?.email) {
    await sendEmail({
      to: user.email,
      ...joinRequestApprovedEmail({
        userName: user.full_name ?? "there",
        subTeamName: teamName,
      }),
    })
  }

  revalidatePath("/sub-teams")
  return { success: true }
}

export async function rejectJoinRequest(requestId: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return { success: false, error: "Not authenticated" }
  const { data: approver } = await supabase
    .from("users").select("id").eq("auth_user_id", authUser.id).single()
  if (!approver) return { success: false, error: "Approver profile not found" }

  const { error } = await supabase
    .from("sub_team_join_requests")
    .update({ status: "rejected", decided_by: approver.id, decided_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "pending")
  if (error) return { success: false, error: error.message }
  revalidatePath("/sub-teams")
  return { success: true }
}

export async function cancelMyJoinRequest(requestId: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return { success: false, error: "Not authenticated" }
  const { data: profile } = await supabase
    .from("users").select("id").eq("auth_user_id", authUser.id).single()
  if (!profile) return { success: false, error: "Profile not found" }

  const { error } = await supabase
    .from("sub_team_join_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("user_id", profile.id)
    .eq("status", "pending")
  if (error) return { success: false, error: error.message }
  revalidatePath("/sub-teams")
  return { success: true }
}

export async function markUserOnboarded(): Promise<Result> {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return { success: false, error: "Not authenticated" }
  const { error } = await supabase
    .from("users")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("auth_user_id", authUser.id)
    .is("onboarded_at", null)
  if (error) return { success: false, error: error.message }
  revalidatePath("/", "layout")
  return { success: true }
}
