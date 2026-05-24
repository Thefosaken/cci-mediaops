import { Suspense } from "react"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { SchedulingPageClient } from "./scheduling-page-client"

export const dynamic = "force-dynamic"

export default async function SchedulingPage() {
  await requireAuth()
  const supabase = await createClient()

  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const [{ data: events }, { data: subTeams }, { data: users }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, start_time, end_time, status, location, event_type")
      .gte("start_time", cutoff)
      .order("start_time", { ascending: true })
      .limit(30),
    supabase.from("sub_teams").select("id, name").eq("status", "active").order("name"),
    supabase.from("users").select("id, full_name, email").eq("status", "active").order("full_name"),
  ])

  const eventIds = (events ?? []).map((e) => e.id)
  const { data: slots } = eventIds.length
    ? await supabase
        .from("schedule_slots")
        .select("*, assigned_user:users!assigned_user_id(id, full_name, email)")
        .in("event_id", eventIds)
    : { data: [] }

  return (
    <Suspense>
      <SchedulingPageClient
        events={events ?? []}
        subTeams={subTeams ?? []}
        users={users ?? []}
        slots={slots ?? []}
      />
    </Suspense>
  )
}
