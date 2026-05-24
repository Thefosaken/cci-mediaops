import { Suspense } from "react"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { EquipmentPageClient } from "./equipment-page-client"

export const dynamic = "force-dynamic"

export default async function EquipmentPage() {
  await requireAuth()
  const supabase = await createClient()

  const [{ data: items }, { data: subTeams }, { data: events }, { data: users }] = await Promise.all([
    supabase
      .from("equipment_items")
      .select("*, sub_teams(id, name), current_custodian:current_custodian_id(id, full_name, email)")
      .order("name"),
    supabase.from("sub_teams").select("id, name").eq("status", "active").order("name"),
    (async () => {
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      return supabase.from("events").select("id, title, start_time").gte("start_time", cutoff).order("start_time").limit(40)
    })(),
    supabase.from("users").select("id, full_name, email").eq("status", "active").order("full_name"),
  ])

  return (
    <Suspense>
      <EquipmentPageClient
        items={items ?? []}
        subTeams={subTeams ?? []}
        events={events ?? []}
        users={users ?? []}
      />
    </Suspense>
  )
}
