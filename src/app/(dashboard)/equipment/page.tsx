import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { EquipmentPageClient } from "./equipment-page-client"

export default async function EquipmentPage() {
  await requireAuth()
  const supabase = await createClient()

  const { data: items } = await supabase
    .from("equipment_items")
    .select("*, sub_teams(name)")
    .order("name")

  const { data: subTeams } = await supabase
    .from("sub_teams")
    .select("id, name")
    .eq("status", "active")

  return <EquipmentPageClient items={items ?? []} subTeams={subTeams ?? []} />
}
