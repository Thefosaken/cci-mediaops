import { Suspense } from "react"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { ApprovalsPageClient } from "./approvals-page-client"

export const dynamic = "force-dynamic"

export default async function ApprovalsPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const membership = await supabase
    .from("campus_memberships")
    .select("role_id, roles(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle()
    .then((r) => r.data)

  const rawRole = (membership as unknown as { roles?: { name?: string } } | null)?.roles?.name
  const isTeamLead = rawRole === "sub_team_lead" || rawRole === "assistant_lead"

  let pendingQuery
  let historyQuery

  if (isTeamLead) {
    const { data: leadRoles } = await supabase
      .from("roles")
      .select("id")
      .in("name", ["sub_team_lead", "assistant_lead"])
    type Row = { id: string }
    const leadRoleIds = (leadRoles ?? []).map((r) => (r as Row).id)

    const { data: mySubTeams } = leadRoleIds.length
      ? await supabase
          .from("sub_team_memberships")
          .select("sub_team_id")
          .in("role_id", leadRoleIds)
          .eq("user_id", user.id)
          .eq("status", "active")
      : { data: [] }
    type STRow = { sub_team_id: string }
    const teamIds = (mySubTeams ?? []).map((m) => (m as STRow).sub_team_id)

    if (teamIds.length) {
      const { data: teamRequests } = await supabase
        .from("request_sub_teams")
        .select("request_id")
        .in("sub_team_id", teamIds)
      type RTRow = { request_id: string }
      const reqIds = [...new Set((teamRequests ?? []).map((r) => (r as RTRow).request_id))]

      pendingQuery = reqIds.length
        ? supabase
            .from("approvals")
            .select("*, requests!left(id, title, requesting_unit, deadline, priority), tasks!left(id, title), submitted_by_user:submitted_by(full_name, email)")
            .in("request_id", reqIds)
            .eq("status", "pending")
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] })

      historyQuery = reqIds.length
        ? supabase
            .from("approvals")
            .select("*, requests!left(id, title), tasks!left(id, title)")
            .in("request_id", reqIds)
            .not("status", "eq", "pending")
            .order("decided_at", { ascending: false })
            .limit(40)
        : Promise.resolve({ data: [] })
    } else {
      pendingQuery = Promise.resolve({ data: [] })
      historyQuery = Promise.resolve({ data: [] })
    }
  } else {
    pendingQuery = supabase
      .from("approvals")
      .select("*, requests!left(id, title, requesting_unit, deadline, priority), tasks!left(id, title), submitted_by_user:submitted_by(full_name, email)")
      .eq("approver_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })

    historyQuery = supabase
      .from("approvals")
      .select("*, requests!left(id, title), tasks!left(id, title)")
      .eq("approver_id", user.id)
      .not("status", "eq", "pending")
      .order("decided_at", { ascending: false })
      .limit(40)
  }

  const [pendingRes, historyRes] = await Promise.all([
    pendingQuery,
    historyQuery,
  ])

  return (
    <Suspense>
      <ApprovalsPageClient
        pending={pendingRes.data ?? []}
        history={historyRes.data ?? []}
      />
    </Suspense>
  )
}
