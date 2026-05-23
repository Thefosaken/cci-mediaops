import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { CalendarPageClient } from "./calendar-page-client"

export default async function CalendarPage() {
  await requireAuth()
  const supabase = await createClient()

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .order("start_time", { ascending: true })

  const { data: subTeams } = await supabase
    .from("sub_teams")
    .select("*")
    .eq("status", "active")

  return <CalendarPageClient events={events ?? []} subTeams={subTeams ?? []} />
}
