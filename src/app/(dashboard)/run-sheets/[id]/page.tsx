import { Suspense } from "react"
import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/permissions"
import type { UserRole } from "@/types"
import { RunSheetTimelineClient } from "./run-sheet-timeline-client"

export const dynamic = "force-dynamic"

export default async function RunSheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const currentUser = await requireAuth()
  const supabase = await createClient()

  // Role resolution mirrors the pattern in sub-teams/page.tsx.
  const membership = await supabase
    .from("campus_memberships")
    .select("role_id, roles(name)")
    .eq("user_id", currentUser.id)
    .eq("status", "active")
    .maybeSingle()
    .then((r) => r.data)

  const role = (membership as unknown as { roles?: { name?: string } } | null)?.roles
    ?.name as UserRole | undefined

  // The gate for every affordance in the timeline. Members get a read-only view.
  const canEdit = role ? hasPermission(role, "run_sheets", "edit") : false
  // Separate from edit: the matrix grants delete to super_admin only, so leads can
  // build and change a sheet but not destroy one.
  const canDelete = role ? hasPermission(role, "run_sheets", "delete") : false

  const [{ data: sheet }, { data: sessions }, { data: subTeams }, { data: users }] =
    await Promise.all([
      supabase
        .from("run_sheets")
        .select("*, events(id, title, start_time), event_slots:slot_id(id, label, slot_date)")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("run_sheet_sessions")
        .select(
          "*, run_sheet_session_cues(id, sub_team_id, cue_text), " +
            "run_sheet_session_members(id, user_id, sub_team_id, role_title, confirmation_status, users:user_id(id, full_name))"
        )
        .eq("run_sheet_id", id)
        .order("start_time", { nullsFirst: false }),
      supabase.from("sub_teams").select("id, name").eq("status", "active").order("name"),
      supabase.from("users").select("id, full_name").eq("status", "active").order("full_name"),
    ])

  if (!sheet) notFound()

  /**
   * Who is rostered for the service this sheet belongs to.
   *
   * Rostering happens weeks before anyone writes the running order, so by the time a
   * sheet exists this is already settled. Surfacing it in the member picker is what
   * stops the sheet and the rota drifting into two documents that disagree about who
   * is turning up.
   *
   * Only published duties: a draft roster is still being argued over, and listing one
   * here would leak it to anyone who can open the sheet.
   */
  const slotId = (sheet as unknown as { slot_id?: string | null }).slot_id ?? null

  const { data: rosterRows } = slotId
    ? await supabase
        .from("duty_assignments")
        .select("user_id, sub_team_id, role_title, status, users:user_id(id, full_name), sub_teams:sub_team_id(id, name)")
        .eq("slot_id", slotId)
        .eq("publish_state", "published")
        .in("status", ["scheduled", "confirmed"])
    : { data: null }

  type RosterJoin = {
    user_id: string
    sub_team_id: string | null
    role_title: string | null
    status: string
    users: { id: string; full_name: string } | null
    sub_teams: { id: string; name: string } | null
  }

  const roster = ((rosterRows ?? []) as unknown as RosterJoin[])
    .filter((r) => r.users)
    .map((r) => ({
      userId: r.user_id,
      fullName: r.users!.full_name,
      subTeamId: r.sub_team_id,
      subTeamName: r.sub_teams?.name ?? null,
      roleTitle: r.role_title,
      confirmed: r.status === "confirmed"
    }))

  // The sheet's active share link, if it has one. Only the token travels to the
  // client — it is the whole credential, and the surrounding row is nobody's business.
  const { data: shareLink } = await supabase
    .from("run_sheet_share_links")
    .select("token")
    .eq("run_sheet_id", id)
    .eq("is_active", true)
    .maybeSingle()

  return (
    <Suspense>
      <RunSheetTimelineClient
        sheet={sheet as unknown as Parameters<typeof RunSheetTimelineClient>[0]["sheet"]}
        roster={roster}
        shareToken={shareLink?.token ?? null}
        sessions={
          (sessions ?? []) as unknown as Parameters<
            typeof RunSheetTimelineClient
          >[0]["sessions"]
        }
        subTeams={subTeams ?? []}
        users={users ?? []}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </Suspense>
  )
}
