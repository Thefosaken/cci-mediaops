import { createAdminClient } from "@/lib/supabase/admin"
import { PublicRequestForm } from "./page-client"

export const dynamic = "force-dynamic"

export default async function PublicRequestPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const admin = createAdminClient()
  const { data: subTeams } = await admin
    .from("sub_teams")
    .select("id, name")
    .eq("status", "active")
    .order("name")

  const teams = (subTeams as { id: string; name: string }[] | null) ?? []

  return <PublicRequestForm token={token} subTeams={teams} />
}
