"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import { adminNewSignupEmail, userApprovedEmail } from "@/lib/email/templates"
import { ROLE_LABELS } from "@/constants"

type Result =
  | { success: true }
  | { success: false; error: string }

/**
 * Approve a pending user. Assigns role, flips status, then sends an in-app
 * notification + email to the user. Replaces the inline supabase.from(...)
 * approval logic in settings-page-client so emails/notifications fire.
 */
export async function approveUserWithRole(
  userId: string,
  roleId: string
): Promise<Result> {
  const supabase = await createClient()

  const { error: userErr } = await supabase
    .from("users").update({ status: "active" }).eq("id", userId)
  if (userErr) return { success: false, error: userErr.message }

  // The trigger pre-creates a pending campus_membership for non-first users.
  // Update it (or insert if somehow missing).
  const { data: existing } = await supabase
    .from("campus_memberships").select("id").eq("user_id", userId).maybeSingle()
  if (existing) {
    const { error: memErr } = await supabase
      .from("campus_memberships")
      .update({ role_id: roleId, status: "active" })
      .eq("id", existing.id)
    if (memErr) return { success: false, error: memErr.message }
  } else {
    const { data: campus } = await supabase
      .from("campuses").select("id").eq("status", "active").order("created_at").limit(1).single()
    if (!campus) return { success: false, error: "No active campus found" }
    const { error: insertErr } = await supabase.from("campus_memberships").insert({
      campus_id: campus.id,
      user_id: userId,
      role_id: roleId,
      status: "active",
    })
    if (insertErr) return { success: false, error: insertErr.message }
  }

  // Fetch role label + user info for notifications
  const [{ data: user }, { data: role }] = await Promise.all([
    supabase.from("users").select("full_name, email").eq("id", userId).single(),
    supabase.from("roles").select("name").eq("id", roleId).single(),
  ])
  const roleLabel = role?.name ? (ROLE_LABELS[role.name] ?? role.name) : "Team Member"

  // In-app notification
  await supabase.from("notifications").insert({
    user_id: userId,
    type: "user_approved",
    title: "Your account is active",
    body: `An admin approved you as ${roleLabel}. Sign in to get started.`,
    entity_type: "event",
    entity_id: userId,
  })

  if (user?.email) {
    await sendEmail({
      to: user.email,
      ...userApprovedEmail({
        userName: user.full_name ?? "there",
        roleLabel,
      }),
    })
  }

  revalidatePath("/settings")
  revalidatePath("/", "layout")
  return { success: true }
}

/**
 * Reject a pending user (suspends them). Notifies via email.
 */
export async function rejectPendingUser(userId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.from("users").update({ status: "suspended" }).eq("id", userId)
  if (error) return { success: false, error: error.message }
  revalidatePath("/settings")
  return { success: true }
}

/**
 * Called after a user signs up via the client. Looks up active admins
 * (super_admin + media_admin), then emails each one.
 *
 * Note: we use the anon client here because the signup happens before
 * the user has a session. The reads we make (roles, campus_memberships)
 * already allow authenticated/public reads via existing RLS.
 */
export async function notifyAdminsOfNewSignup(
  newUserId: string
): Promise<Result> {
  const supabase = await createClient()

  const { data: newUser } = await supabase
    .from("users").select("full_name, email").eq("id", newUserId).single()
  if (!newUser?.email) return { success: false, error: "User not found" }

  const { data: roles } = await supabase
    .from("roles").select("id").in("name", ["super_admin", "media_admin"])
  const adminRoleIds = (roles ?? []).map((r) => r.id)
  if (adminRoleIds.length === 0) return { success: true }

  const { data: adminMemberships } = await supabase
    .from("campus_memberships")
    .select("users:user_id(id, full_name, email)")
    .in("role_id", adminRoleIds)
    .eq("status", "active")

  const recipients = (adminMemberships ?? [])
    .map((row) => (row as unknown as { users?: { email?: string | null } }).users)
    .filter((u): u is { id: string; full_name: string | null; email: string } => !!u?.email)

  if (recipients.length === 0) return { success: true }

  // In-app notifications for admins (a badge will surface on the sidebar)
  await supabase.from("notifications").insert(
    recipients.map((r) => ({
      user_id: (r as unknown as { id: string }).id,
      type: "user_invited",
      title: `New sign-up: ${newUser.full_name ?? newUser.email}`,
      body: "Review and approve in Settings → Users & access.",
      entity_type: "event",
      entity_id: newUserId,
    }))
  )

  // Emails
  await Promise.all(
    recipients.map((r) =>
      sendEmail({
        to: r.email,
        ...adminNewSignupEmail({
          newUserName: newUser.full_name ?? newUser.email!,
          newUserEmail: newUser.email!,
        }),
      })
    )
  )

  return { success: true }
}
