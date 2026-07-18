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

  const [{ data: sheet }, { data: sessions }, { data: subTeams }, { data: users }] =
    await Promise.all([
      supabase
        .from("run_sheets")
        .select("*, events(id, title, start_time)")
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

  return (
    <Suspense>
      <RunSheetTimelineClient
        sheet={sheet as unknown as Parameters<typeof RunSheetTimelineClient>[0]["sheet"]}
        sessions={
          (sessions ?? []) as unknown as Parameters<
            typeof RunSheetTimelineClient
          >[0]["sessions"]
        }
        subTeams={subTeams ?? []}
        users={users ?? []}
        canEdit={canEdit}
      />
    </Suspense>
  )
}
