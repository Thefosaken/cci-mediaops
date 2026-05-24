import { Suspense } from "react"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { CalendarPageClient } from "./calendar-page-client"

export const dynamic = "force-dynamic"

export default async function CalendarPage() {
  await requireAuth()
  const supabase = await createClient()

  const [{ data: events }, { data: subTeams }] = await Promise.all([
    supabase
      .from("events")
      .select("*, event_sub_teams(sub_team_id, sub_teams(id,name))")
      .order("start_time", { ascending: true }),
    supabase
      .from("sub_teams")
      .select("id,name")
      .eq("status", "active")
      .order("name"),
  ])

  return (
    <Suspense>
      <CalendarPageClient events={events ?? []} subTeams={subTeams ?? []} />
    </Suspense>
  )
}
