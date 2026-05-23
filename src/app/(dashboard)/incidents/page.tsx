import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { IncidentsPageClient } from "./incidents-page-client"

export default async function IncidentsPage() {
  await requireAuth()
  const supabase = await createClient()

  const { data: incidents } = await supabase
    .from("incidents")
    .select("*, events(title), sub_teams(name), users!incidents_reported_by_fkey(full_name)")
    .order("created_at", { ascending: false })

  const { data: events } = await supabase
    .from("events")
    .select("id, title")
    .order("start_time", { ascending: false })

  const { data: subTeams } = await supabase
    .from("sub_teams")
    .select("id, name")
    .eq("status", "active")

  return <IncidentsPageClient incidents={incidents ?? []} events={events ?? []} subTeams={subTeams ?? []} />
}
