import { Suspense } from "react"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { RequestsPageClient } from "./requests-page-client"

export const dynamic = "force-dynamic"

export default async function RequestsPage() {
  await requireAuth()
  const supabase = await createClient()

  const [requestsRes, subTeamsRes, eventsRes, usersRes] = await Promise.all([
    supabase
      .from("requests")
      .select("*, request_sub_teams(sub_team_id, sub_teams(id, name)), requester:requester_id(full_name, email), events:event_id(id, title, start_time)")
      .order("created_at", { ascending: false }),
    supabase.from("sub_teams").select("id, name").eq("status", "active").order("name"),
    supabase.from("events").select("id, title, start_time").order("start_time", { ascending: false }).limit(60),
    supabase.from("users").select("id, full_name, email").eq("status", "active").order("full_name"),
  ])

  return (
    <Suspense>
      <RequestsPageClient
        requests={requestsRes.data ?? []}
        subTeams={subTeamsRes.data ?? []}
        events={eventsRes.data ?? []}
        users={usersRes.data ?? []}
      />
    </Suspense>
  )
}
