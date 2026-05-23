import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { RequestsPageClient } from "./requests-page-client"

export default async function RequestsPage() {
  await requireAuth()
  const supabase = await createClient()

  const { data: requests } = await supabase
    .from("requests")
    .select("*, request_sub_teams(sub_team_id, sub_teams(name))")
    .order("created_at", { ascending: false })

  const { data: subTeams } = await supabase
    .from("sub_teams")
    .select("*")
    .eq("status", "active")

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .order("start_time", { ascending: false })

  return (
    <RequestsPageClient
      requests={requests ?? []}
      subTeams={subTeams ?? []}
      events={events ?? []}
    />
  )
}
