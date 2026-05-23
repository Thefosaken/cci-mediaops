import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { SchedulingPageClient } from "./scheduling-page-client"

export default async function SchedulingPage() {
  await requireAuth()
  const supabase = await createClient()

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .gte("start_time", new Date().toISOString())
    .order("start_time", { ascending: true })
    .limit(20)

  const { data: subTeams } = await supabase
    .from("sub_teams")
    .select("id, name")
    .eq("status", "active")

  const { data: users } = await supabase
    .from("users")
    .select("id, full_name")
    .eq("status", "active")

  const { data: slots } = await supabase
    .from("schedule_slots")
    .select("*, users!schedule_slots_assigned_user_id_fkey(full_name)")
    .in("event_id", (events ?? []).map((e) => e.id))

  return (
    <SchedulingPageClient
      events={events ?? []}
      subTeams={subTeams ?? []}
      users={users ?? []}
      slots={slots ?? []}
    />
  )
}
