import { Suspense } from "react"

import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { assignableTeamIds, canPublishRoster, hasPermission, seesAllTeams } from "@/lib/permissions"
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
  const canEditEvents = role ? hasPermission(role, "events", "create") : false
  // Cancelling and deleting are gated separately — a lead runs their own event, but
  // standing one down takes every other team's roster with it.
  const canDeleteEvents = role ? hasPermission(role, "events", "delete") : false
  const canCreateRunSheet = role ? hasPermission(role, "run_sheets", "create") : false
  const canPublish = role ? canPublishRoster(role) : false
  const allTeams = role ? seesAllTeams(role) : false

  const { data: myTeams } = await supabase
    .from("sub_team_memberships")
    .select("sub_team_id")
    .eq("user_id", currentUser.id)
    .eq("status", "active")

  const myTeamIds = (myTeams ?? []).map((m) => m.sub_team_id)

  const [
    { data: events },
    { data: subTeams },
    { data: users },
    // Order must track the Promise.all array below.
    { data: memberships },
    { data: runSheets },
    { data: templates }
  ] = await Promise.all([
    // Slots and their requirements travel with the event: the calendar needs both to
    // draw a day's services and to say how well each one is staffed, and splitting
    // them into separate round trips only invites the two to disagree.
    supabase
      .from("events")
      .select(
        `id, title, event_type, description, start_time, end_time, status, location, recurrence_group_id,
         event_sub_teams(sub_team_id),
         event_slots(id, label, slot_order, slot_date, start_time, end_time, notes,
                     event_slot_requirements(sub_team_id, needed_count))`
      )
      .order("start_time"),
    supabase.from("sub_teams").select("id, name, color").eq("status", "active").order("name"),
    supabase.from("users").select("id, full_name").eq("status", "active").order("full_name"),
    // Every active team membership, so picking a person can resolve their team without
    // asking — nobody should have to restate something the system already knows.
    supabase.from("sub_team_memberships").select("user_id, sub_team_id").eq("status", "active"),
    supabase
      .from("run_sheets")
      .select("id, title, event_id, slot_id, sheet_date")
      .eq("is_template", false),
    // Offered when starting a sheet from a service — most services run the same shape
    // every week, so beginning from a blank page is rarely what anyone wants.
    supabase
      .from("run_sheets")
      .select("id, title")
      .eq("is_template", true)
      .order("title")
  ])

  const dutySelect =
    "id, user_id, sub_team_id, slot_id, slot_no, duty_date, event_id, role_title, call_time, status, publish_state, users:user_id(id, full_name), sub_teams:sub_team_id(id, name, color)"

  /**
   * Drafts are the scheduler's private working state, so they are filtered out of the
   * query rather than hidden in the client — a half-built rota must not be reachable
   * by anyone it names, and a client-side filter is not a boundary.
   *
   * A scheduler sees drafts only for teams they may roster into. One lead's unfinished
   * month is not another lead's business.
   */
  const publishedQuery = supabase
    .from("duty_assignments")
    .select(dutySelect)
    .eq("publish_state", "published")
    .order("duty_date")

  const draftTeamIds = role ? assignableTeamIds(role, myTeamIds, (subTeams ?? []).map((t) => t.id)) : []

  const draftQuery =
    canSchedule && (allTeams || draftTeamIds.length > 0)
      ? supabase
          .from("duty_assignments")
          .select(dutySelect)
          .eq("publish_state", "draft")
          .order("duty_date")
          .then((r) =>
            allTeams
              ? r
              : { ...r, data: (r.data ?? []).filter((d) => draftTeamIds.includes(d.sub_team_id)) }
          )
      : Promise.resolve({ data: [] })

  const [{ data: published }, { data: drafts }] = await Promise.all([publishedQuery, draftQuery])

  const duties = [...(published ?? []), ...(drafts ?? [])]

  type ClientProps = Parameters<typeof CalendarPageClient>[0]

  return (
    <Suspense>
      <CalendarPageClient
        events={(events ?? []) as unknown as ClientProps["events"]}
        subTeams={subTeams ?? []}
        duties={duties as unknown as ClientProps["duties"]}
        runSheets={runSheets ?? []}
        templates={templates ?? []}
        users={users ?? []}
        memberships={memberships ?? []}
        myTeamIds={myTeamIds}
        currentUserId={currentUser.id}
        canSchedule={canSchedule}
        canEditEvents={canEditEvents}
        canDeleteEvents={canDeleteEvents}
        canCreateRunSheet={canCreateRunSheet}
        canPublish={canPublish}
        seesAllTeams={allTeams}
      />
    </Suspense>
  )
}
