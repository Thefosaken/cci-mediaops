import { Suspense } from "react"
import { requireAuth, getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { SettingsPageClient } from "./settings-page-client"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const user = await requireAuth()
  const userWithRole = await getCurrentUserWithRole()
  const roleName = (userWithRole as unknown as { campus_memberships?: { roles?: { name?: string } }[] } | null)
    ?.campus_memberships?.[0]?.roles?.name
  const isAdmin = roleName === "super_admin" || roleName === "media_admin"
  const canCreateLinks = !!(roleName && ["super_admin", "media_admin", "sub_team_lead", "assistant_lead"].includes(roleName))

  const supabase = await createClient()

  const [allUsersRes, subTeamsRes, rolesRes, campusRes, publicLinksRes] = await Promise.all([
    supabase
      .from("users")
      .select("*, campus_memberships(id, role_id, status)")
      .order("full_name"),
    supabase.from("sub_teams").select("*").order("name"),
    supabase.from("roles").select("*").order("name"),
    supabase.from("campuses").select("*").limit(1).maybeSingle(),
    supabase
      .from("public_request_links")
      .select("*, created_by_user:created_by(full_name, email)")
      .order("created_at", { ascending: false }),
  ])

  const all = allUsersRes.data ?? []

  // Bucket: "invited" = invited but not yet accepted (auth link unconsumed).
  // Everyone else with status='active' is shown in the Active list.
  // Legacy pending users (status='pending' WITHOUT invited_at) still show as
  // "Pending approval" so older sign-up data isn't lost in the transition.
  const invited = all.filter(
    (u) => u.invited_at && !u.accepted_invite_at
  )
  const legacyPending = all.filter(
    (u) => u.status === "pending" && !u.invited_at
  )
  const active = all.filter(
    (u) =>
      u.status === "active" &&
      (!u.invited_at || u.accepted_invite_at)
  )

  return (
    <Suspense>
      <SettingsPageClient
        currentUser={user}
        roleName={roleName ?? null}
        isAdmin={isAdmin}
        canCreateLinks={!!canCreateLinks}
        invitedUsers={invited}
        pendingUsers={legacyPending}
        activeUsers={active}
        subTeams={subTeamsRes.data ?? []}
        roles={rolesRes.data ?? []}
        campus={campusRes.data ?? null}
        publicLinks={publicLinksRes.data ?? []}
      />
    </Suspense>
  )
}
