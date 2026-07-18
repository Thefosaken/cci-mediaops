import { Suspense } from "react"
import { requireAuth, getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { RequestsPageClient } from "./requests-page-client"

export const dynamic = "force-dynamic"

export default async function RequestsPage() {
  await requireAuth()
  const supabase = await createClient()

  const userWithRole = await getCurrentUserWithRole()
  const rawRole = (userWithRole as unknown as { campus_memberships?: { roles?: { name?: string } }[] } | null)
    ?.campus_memberships?.[0]?.roles?.name
  const canCreateLinks = !!(rawRole && ["super_admin", "media_admin", "sub_team_lead", "assistant_lead"].includes(rawRole))

  const [requestsRes, subTeamsRes, eventsRes, usersRes, publicLinksRes] = await Promise.all([
    supabase
      .from("requests")
      .select("*, request_sub_teams(sub_team_id, sub_teams(id, name)), requester:requester_id(full_name, email), events:event_id(id, title, start_time)")
      .order("created_at", { ascending: false }),
    supabase.from("sub_teams").select("id, name").eq("status", "active").order("name"),
    supabase.from("events").select("id, title, start_time").order("start_time", { ascending: false }).limit(60),
    supabase.from("users").select("id, full_name, email").eq("status", "active").order("full_name"),
    supabase.from("public_request_links").select("id, token, label").eq("is_active", true).order("created_at", { ascending: false }),
  ])

  return (
    <Suspense>
      <RequestsPageClient
        requests={requestsRes.data ?? []}
        subTeams={subTeamsRes.data ?? []}
        events={eventsRes.data ?? []}
        users={usersRes.data ?? []}
        publicLinks={publicLinksRes.data ?? []}
        canCreateLinks={canCreateLinks}
      />
    </Suspense>
  )
}
