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

  /*
    Someone filing a request from inside the app doesn't need to tell us which
    unit they're from — we already know. Their sub-team stands in for it, so the
    field is filled and locked rather than asked for. Members of no sub-team
    (e.g. a Protocol volunteer) have nothing to derive from, so `null` here makes
    the client fall back to showing the selector.
  */
  const currentUserId = (userWithRole as unknown as { id?: string } | null)?.id ?? null
  let defaultUnit: string | null = null
  if (currentUserId) {
    const { data: membership } = await supabase
      .from("sub_team_memberships")
      .select("sub_teams(name)")
      .eq("user_id", currentUserId)
      .limit(1)
      .maybeSingle()
    // Supabase types joins as arrays even when the FK is single, and the
    // runtime shape differs by query — accept both rather than silently
    // falling back to the picker for everyone.
    const joined = (membership as unknown as {
      sub_teams?: { name?: string } | { name?: string }[] | null
    } | null)?.sub_teams
    const team = Array.isArray(joined) ? joined[0] : joined
    defaultUnit = team?.name ?? null
  }

  const [requestsRes, subTeamsRes, eventsRes, usersRes, publicLinksRes] = await Promise.all([
    supabase
      .from("requests")
      .select("*, request_sub_teams(sub_team_id, sub_teams(id, name)), requester:requester_id(full_name, email), events:event_id(id, title, start_time), tasks(id, assigned_user_id, assigned_user:assigned_user_id(id, full_name, email))")
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
        defaultUnit={defaultUnit}
      />
    </Suspense>
  )
}
