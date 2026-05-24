"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient, adminClientConfigured } from "@/lib/supabase/admin"
import { sendEmail, APP_URL } from "@/lib/email"
import { invitationEmail } from "@/lib/email/templates"
import { ROLE_LABELS } from "@/constants"

type Result =
  | { success: true; data?: { userId: string; email: string } }
  | { success: false; error: string }

/**
 * Invite a teammate. Uses the Supabase admin API to create the auth
 * user (without sending Supabase's default email), then sends our own
 * branded email via Resend with a magic invite link.
 *
 * The role is assigned upfront so the invitee can use the app immediately
 * after setting their password — no admin approval step required.
 */
export async function inviteMember(input: {
  email: string
  fullName: string
  roleId: string
}): Promise<Result> {
  const email = input.email.trim().toLowerCase()
  const fullName = input.fullName.trim()
  if (!email || !email.includes("@")) {
    return { success: false, error: "Enter a valid email address" }
  }
  if (!fullName) {
    return { success: false, error: "Enter the invitee's full name" }
  }
  if (!input.roleId) {
    return { success: false, error: "Choose a role" }
  }
  if (!adminClientConfigured()) {
    return {
      success: false,
      error:
        "Service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY on Vercel and redeploy.",
    }
  }

  const supabase = await createClient()
  const admin = createAdminClient()

  // Look up the inviter for the email signature
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const { data: inviter } = authUser
    ? await supabase.from("users").select("full_name").eq("auth_user_id", authUser.id).single()
    : { data: null }

  const { data: campus } = await supabase
    .from("campuses").select("id").eq("status", "active").order("created_at").limit(1).single()
  if (!campus) {
    return { success: false, error: "No active campus found — first user must sign up first" }
  }

  const { data: role } = await supabase
    .from("roles").select("id, name").eq("id", input.roleId).single()
  if (!role) return { success: false, error: "Role not found" }
  const roleLabel = ROLE_LABELS[role.name] ?? role.name

  // 1. Check whether this email is already in public.users
  const { data: existingProfile } = await supabase
    .from("users").select("id, status, auth_user_id").eq("email", email).maybeSingle()

  let userProfileId = existingProfile?.id ?? null
  let alreadyHasAuth = Boolean(existingProfile?.auth_user_id)

  // 2. If the auth user doesn't exist yet, generate an invite link.
  //    We use generateLink (not inviteUserByEmail) so Supabase doesn't
  //    send its default email — we'll send our own.
  let inviteUrl: string | null = null
  if (!alreadyHasAuth) {
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: { full_name: fullName },
        redirectTo: `${APP_URL}/set-password`,
      },
    })
    if (linkErr) return { success: false, error: linkErr.message }
    inviteUrl = link.properties?.action_link ?? null

    // Re-fetch profile in case the trigger just created it
    if (!userProfileId) {
      const { data: p } = await supabase
        .from("users").select("id").eq("email", email).maybeSingle()
      userProfileId = p?.id ?? null
    }
    alreadyHasAuth = true
  }

  if (!userProfileId) {
    return { success: false, error: "Couldn't create the user record" }
  }

  // 3. Set the profile to active + the chosen full_name + stamp invited_at
  //    (so Settings can bucket as "Pending invite" until they accept).
  await supabase
    .from("users")
    .update({
      full_name: fullName,
      status: "active",
      invited_at: new Date().toISOString(),
    })
    .eq("id", userProfileId)

  // 4. Upsert the campus_membership with role + active status
  const { data: membership } = await supabase
    .from("campus_memberships").select("id").eq("user_id", userProfileId).maybeSingle()
  if (membership) {
    await supabase
      .from("campus_memberships")
      .update({ role_id: input.roleId, status: "active" })
      .eq("id", membership.id)
  } else {
    await supabase.from("campus_memberships").insert({
      campus_id: campus.id,
      user_id: userProfileId,
      role_id: input.roleId,
      status: "active",
    })
  }

  // 5. Send the invite email (only if we just created a fresh auth user
  //    with an invite link; resends should use resendInvite explicitly)
  if (inviteUrl) {
    await sendEmail({
      to: email,
      ...invitationEmail({
        inviteeName: fullName,
        inviterName: inviter?.full_name ?? null,
        roleLabel,
        inviteUrl,
      }),
    })
  }

  revalidatePath("/settings")
  return { success: true, data: { userId: userProfileId, email } }
}

/**
 * Generate a fresh invite link + re-email it. Useful when the original
 * link expired or the invitee lost the email.
 */
export async function resendInvite(userId: string): Promise<Result> {
  if (!adminClientConfigured()) {
    return { success: false, error: "Service role key not configured." }
  }
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, full_name, campus_memberships(role_id, roles:role_id(name))")
    .eq("id", userId)
    .single()
  if (!profile?.email) return { success: false, error: "User not found" }

  const roleName = (profile as unknown as {
    campus_memberships?: { roles?: { name?: string } }[]
  }).campus_memberships?.[0]?.roles?.name
  const roleLabel = roleName ? (ROLE_LABELS[roleName] ?? roleName) : "Member"

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email: profile.email,
    options: { redirectTo: `${APP_URL}/set-password` },
  })
  if (linkErr) return { success: false, error: linkErr.message }
  const inviteUrl = link.properties?.action_link
  if (!inviteUrl) return { success: false, error: "Could not generate invite link" }

  await supabase.from("users").update({ invited_at: new Date().toISOString() }).eq("id", userId)

  const { data: { user: authUser } } = await supabase.auth.getUser()
  const { data: inviter } = authUser
    ? await supabase.from("users").select("full_name").eq("auth_user_id", authUser.id).single()
    : { data: null }

  await sendEmail({
    to: profile.email,
    ...invitationEmail({
      inviteeName: profile.full_name,
      inviterName: inviter?.full_name ?? null,
      roleLabel,
      inviteUrl,
    }),
  })

  revalidatePath("/settings")
  return { success: true }
}

/**
 * Cancel a pending invite: delete the auth.users row AND the public.users
 * row so the email becomes available again.
 */
export async function cancelInvite(userId: string): Promise<Result> {
  if (!adminClientConfigured()) {
    return { success: false, error: "Service role key not configured." }
  }
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: profile } = await supabase
    .from("users").select("id, auth_user_id, email").eq("id", userId).single()
  if (!profile) return { success: false, error: "User not found" }

  if (profile.auth_user_id) {
    const { error: authErr } = await admin.auth.admin.deleteUser(profile.auth_user_id)
    if (authErr && !authErr.message.toLowerCase().includes("not found")) {
      return { success: false, error: authErr.message }
    }
  }

  // public.users will cascade-delete memberships/notifications
  await supabase.from("users").delete().eq("id", profile.id)

  revalidatePath("/settings")
  return { success: true }
}
