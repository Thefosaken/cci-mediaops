import { Suspense } from "react"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { IncidentsPageClient } from "./incidents-page-client"

export const dynamic = "force-dynamic"

export default async function IncidentsPage() {
  await requireAuth()
  const supabase = await createClient()

  const [incRes, eventsRes, subTeamsRes] = await Promise.all([
    supabase
      .from("incidents")
      .select("*, events(id, title, start_time), sub_teams(id, name), reporter:users!reported_by(full_name, email)")
      .order("created_at", { ascending: false }),
    supabase.from("events").select("id, title, start_time").order("start_time", { ascending: false }).limit(60),
    supabase.from("sub_teams").select("id, name").eq("status", "active").order("name"),
  ])

  return (
    <Suspense>
      <IncidentsPageClient
        incidents={incRes.data ?? []}
        events={eventsRes.data ?? []}
        subTeams={subTeamsRes.data ?? []}
      />
    </Suspense>
  )
}
