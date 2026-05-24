import { Suspense } from "react"
import { requireAuth, getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { SubTeamsPageClient } from "./sub-teams-page-client"

export const dynamic = "force-dynamic"

export default async function SubTeamsPage() {
  const currentUser = await requireAuth()
  const userWithRole = await getCurrentUserWithRole()
  const supabase = await createClient()

  const adminRoleName = (userWithRole as unknown as { campus_memberships?: { roles?: { name?: string } }[] } | null)
    ?.campus_memberships?.[0]?.roles?.name
  const isAdmin = adminRoleName === "super_admin" || adminRoleName === "media_admin"

  const [subTeamsRes, usersRes, rolesRes, myMembershipsRes, myJoinRequestsRes, allJoinRequestsRes] = await Promise.all([
    supabase
      .from("sub_teams")
      .select("id, name, description, status, sub_team_memberships(role_id, users:user_id(id, full_name, email), roles:role_id(id, name)), tasks(id, title, status, assigned_user_id, due_date, priority)")
      .order("name"),
    supabase.from("users").select("id, full_name, email").eq("status", "active").order("full_name"),
    supabase.from("roles").select("id, name").in("name", ["sub_team_lead", "assistant_lead", "team_member"]),
    supabase
      .from("sub_team_memberships")
      .select("sub_team_id, role_id, roles:role_id(name)")
      .eq("user_id", currentUser.id)
      .eq("status", "active"),
    supabase
      .from("sub_team_join_requests")
      .select("id, sub_team_id, status, created_at")
      .eq("user_id", currentUser.id)
      .in("status", ["pending", "approved", "rejected"]),
    supabase
      .from("sub_team_join_requests")
      .select("id, sub_team_id, user_id, status, message, created_at, user:user_id(id, full_name, email)")
      .eq("status", "pending"),
  ])

  const subTeams = subTeamsRes.data ?? []
  const subTeamIds = subTeams.map((s) => s.id)

  const reqJoinsRes = subTeamIds.length
    ? await supabase
        .from("request_sub_teams")
        .select("sub_team_id, requests(id, title, status, priority, deadline, requesting_unit)")
        .in("sub_team_id", subTeamIds)
    : { data: [] }

  const equipRes = subTeamIds.length
    ? await supabase
        .from("equipment_items")
        .select("id, sub_team_id, condition_status, availability_status")
        .in("sub_team_id", subTeamIds)
    : { data: [] }

  return (
    <Suspense>
      <SubTeamsPageClient
        subTeams={subTeams as unknown as Parameters<typeof SubTeamsPageClient>[0]["subTeams"]}
        allUsers={usersRes.data ?? []}
        roles={rolesRes.data ?? []}
        requestJoins={(reqJoinsRes.data ?? []) as unknown as Parameters<typeof SubTeamsPageClient>[0]["requestJoins"]}
        equipment={equipRes.data ?? []}
        currentUserId={currentUser.id}
        isAdmin={isAdmin}
        myMemberships={(myMembershipsRes.data ?? []) as unknown as Parameters<typeof SubTeamsPageClient>[0]["myMemberships"]}
        myJoinRequests={myJoinRequestsRes.data ?? []}
        pendingJoinRequests={(allJoinRequestsRes.data ?? []) as unknown as Parameters<typeof SubTeamsPageClient>[0]["pendingJoinRequests"]}
      />
    </Suspense>
  )
}
