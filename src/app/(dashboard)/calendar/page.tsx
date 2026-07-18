import { Suspense } from "react"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/permissions"
import type { UserRole } from "@/types"
import { CalendarPageClient } from "./calendar-page-client"

export const dynamic = "force-dynamic"

export default async function CalendarPage() {
  const currentUser = await requireAuth()
  const supabase = await createClient()

  const membership = await supabase
    .from("campus_memberships")
    .select("roles(name)")
    .eq("user_id", currentUser.id)
    .eq("status", "active")
    .maybeSingle()
    .then((r) => r.data)

  const role = (membership as unknown as { roles?: { name?: string } } | null)?.roles
    ?.name as UserRole | undefined

  const canSchedule = role ? hasPermission(role, "schedules", "create") : false
  /** Admins work across every team; everyone else is anchored to their own. */
  const seesAllTeams = role === "super_admin" || role === "media_admin"

  const [
    { data: events },
    { data: subTeams },
    { data: duties },
    { data: myTeams },
    { data: users },
    // Order must track the Promise.all array below.
    { data: memberships },
    { data: runSheets },
  ] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, title, event_type, start_time, end_time, status, location, event_sub_teams(sub_team_id)"
      )
      .order("start_time"),
    supabase.from("sub_teams").select("id, name, color").eq("status", "active").order("name"),
    supabase
      .from("duty_assignments")
      .select("*, users:user_id(id, full_name), sub_teams:sub_team_id(id, name, color)")
      .order("duty_date"),
    supabase
      .from("sub_team_memberships")
      .select("sub_team_id")
      .eq("user_id", currentUser.id)
      .eq("status", "active"),
    supabase.from("users").select("id, full_name").eq("status", "active").order("full_name"),
    // Every active team membership, so picking a person can resolve their team without
    // asking — nobody should have to restate something the system already knows.
    supabase
      .from("sub_team_memberships")
      .select("user_id, sub_team_id")
      .eq("status", "active"),
    // Linked by date and event, so a day showing a service can jump straight to its sheet.
    supabase.from("run_sheets").select("id, title, event_id, sheet_date").eq("is_template", false),
  ])

  return (
    <Suspense>
      <CalendarPageClient
        events={(events ?? []) as unknown as Parameters<typeof CalendarPageClient>[0]["events"]}
        subTeams={subTeams ?? []}
        duties={(duties ?? []) as unknown as Parameters<typeof CalendarPageClient>[0]["duties"]}
        runSheets={runSheets ?? []}
        users={users ?? []}
        memberships={memberships ?? []}
        myTeamIds={(myTeams ?? []).map((m) => m.sub_team_id)}
        currentUserId={currentUser.id}
        canSchedule={canSchedule}
        seesAllTeams={seesAllTeams}
      />
    </Suspense>
  )
}
