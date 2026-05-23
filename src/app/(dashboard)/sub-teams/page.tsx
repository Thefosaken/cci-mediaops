import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { SubTeamsPageClient } from "./sub-teams-page-client"

export default async function SubTeamsPage() {
  await requireAuth()
  const supabase = await createClient()

  const { data: subTeams } = await supabase
    .from("sub_teams")
    .select("*, sub_team_memberships(users(id, full_name, email)), tasks(*)")
    .eq("status", "active")

  const { data: allUsers } = await supabase
    .from("users")
    .select("id, full_name, email")
    .eq("status", "active")

  const subTeamRequests = await Promise.all(
    (subTeams ?? []).map(async (st) => {
      const { data: reqs } = await supabase
        .from("request_sub_teams")
        .select("*, requests(*)")
        .eq("sub_team_id", st.id)
      return { subTeamId: st.id, requests: reqs ?? [] }
    })
  )

  return (
    <SubTeamsPageClient
      subTeams={subTeams ?? []}
      allUsers={allUsers ?? []}
      subTeamRequests={subTeamRequests}
    />
  )
}
