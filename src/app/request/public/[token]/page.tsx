import { adminClientConfigured, createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { PublicRequestForm } from "./page-client"

export const dynamic = "force-dynamic"

export default async function PublicRequestPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  let teams: { id: string; name: string }[] = []

  try {
    if (adminClientConfigured()) {
      const admin = createAdminClient()
      const { data } = await (admin.from("sub_teams" as never) as any)
        .select("id, name")
        .eq("status", "active")
        .order("name")
      if (data) teams = data as { id: string; name: string }[]
    } else {
      const supabase = await createClient()
      const { data } = await (supabase.from("sub_teams" as never) as any)
        .select("id, name")
        .eq("status", "active")
        .order("name")
      if (data) teams = data as { id: string; name: string }[]
    }
  } catch {
    teams = []
  }

  return <PublicRequestForm token={token} subTeams={teams} />
}
