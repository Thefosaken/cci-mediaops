import { Suspense } from "react"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { SubTeamsPageClient } from "./sub-teams-page-client"

export const dynamic = "force-dynamic"

export default async function SubTeamsPage() {
  await requireAuth()
  const supabase = await createClient()

  const [subTeamsRes, usersRes, rolesRes] = await Promise.all([
    supabase
      .from("sub_teams")
      .select("id, name, description, status, sub_team_memberships(role_id, users:user_id(id, full_name, email), roles:role_id(id, name)), tasks(id, title, status, assigned_user_id, due_date, priority)")
      .order("name"),
    supabase.from("users").select("id, full_name, email").eq("status", "active").order("full_name"),
    supabase.from("roles").select("id, name").in("name", ["sub_team_lead", "assistant_lead", "team_member"]),
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
      />
    </Suspense>
  )
}
