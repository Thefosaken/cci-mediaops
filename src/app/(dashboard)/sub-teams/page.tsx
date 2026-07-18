import { Suspense } from "react"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { SubTeamsPageClient } from "./sub-teams-page-client"
import type { UserRole } from "@/types"

export const dynamic = "force-dynamic"

export default async function SubTeamsPage() {
  const currentUser = await requireAuth()
  const supabase = await createClient()

  const membership = await supabase
    .from("campus_memberships")
    .select("role_id, roles(name)")
    .eq("user_id", currentUser.id)
    .eq("status", "active")
    .maybeSingle()
    .then((r) => r.data)

  const rawRole = (membership as unknown as { roles?: { name?: string } } | null)?.roles?.name as UserRole | undefined
  const isAdmin = rawRole === "super_admin" || rawRole === "media_admin"

  const [allSubTeamsRes, usersRes, rolesRes, myMembershipsRes, myJoinRequestsRes, allJoinRequestsRes] = await Promise.all([
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

  const myMemberships = (myMembershipsRes.data ?? []) as unknown as { sub_team_id: string; role_id: string | null; roles: { name: string } | null }[]
  const mySubTeamIds = myMemberships.map((m) => m.sub_team_id)

  const allSubTeams = allSubTeamsRes.data ?? []
  const subTeams = isAdmin ? allSubTeams : allSubTeams.filter((s) => mySubTeamIds.includes(s.id))
  const subTeamIds = subTeams.map((s) => s.id)

  const allPending = allJoinRequestsRes.data ?? []
  const filteredPendingRequests = isAdmin ? allPending : allPending.filter((r) => subTeamIds.includes((r as { sub_team_id: string }).sub_team_id))

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
        myMemberships={myMemberships as unknown as Parameters<typeof SubTeamsPageClient>[0]["myMemberships"]}
        myJoinRequests={myJoinRequestsRes.data ?? []}
        pendingJoinRequests={filteredPendingRequests as unknown as Parameters<typeof SubTeamsPageClient>[0]["pendingJoinRequests"]}
      />
    </Suspense>
  )
}
