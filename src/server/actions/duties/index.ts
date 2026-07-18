"use server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { hasPermission } from "@/lib/permissions"
import { revalidatePath } from "next/cache"
import { createNotification } from "@/lib/notifications"
import type { UserRole, DutyStatus } from "@/types"

/**
 * Duty rostering — who is on which team on which day.
 *
 * RLS is permissive by project convention (CLAUDE.md), so every mutation here checks
 * permission itself. Scheduling maps to the `schedules` resource: admins and leads can
 * roster, members can only respond to their own.
 */

type Guard =
  | { ok: true; role: UserRole; userId: string; campusId: string }
  | { ok: false; error: string }

async function requireScheduler(): Promise<Guard> {
  const profile = await getCurrentUserWithRole()
  if (!profile) return { ok: false, error: "Not signed in" }

  const memberships = profile.campus_memberships as
    | { campus_id: string; roles: { name: UserRole } | null }[]
    | undefined
  const first = memberships?.[0]
  const role = first?.roles?.name

  if (!role || !first) return { ok: false, error: "No role assigned" }
  if (!hasPermission(role, "schedules", "create")) {
    return { ok: false, error: "You do not have permission to schedule people" }
  }
  return { ok: true, role, userId: profile.id, campusId: first.campus_id }
}

/** Put one person on duty for one day. */
export async function assignDuty(input: {
  userId: string
  subTeamId: string
  dutyDate: string
  eventId?: string
  roleTitle?: string
  callTime?: string
}) {
  const guard = await requireScheduler()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("duty_assignments")
    .insert({
      campus_id: guard.campusId,
      sub_team_id: input.subTeamId,
      user_id: input.userId,
      duty_date: input.dutyDate,
      event_id: input.eventId ?? null,
      role_title: input.roleTitle ?? null,
      call_time: input.callTime ?? null,
      created_by: guard.userId,
    })
    .select("id")
    .single()

  if (error) {
    if (error.code === "23505") return { error: "They are already on that team that day" }
    return { error: error.message }
  }

  await notifyRostered(input.userId, input.subTeamId, [input.dutyDate], data.id)

  revalidatePath("/calendar")
  return { success: true }
}

/**
 * Tell someone they have been put on duty.
 *
 * One notification per batch rather than per day — being scheduled for four Sundays
 * is one piece of news, and four identical rows would bury everything else in their
 * feed. Failures are swallowed by createNotification, so a notification problem never
 * costs someone their roster.
 */
async function notifyRostered(
  userId: string,
  subTeamId: string,
  dates: string[],
  entityId: string
) {
  if (dates.length === 0) return

  const supabase = await createClient()
  const { data: team } = await supabase
    .from("sub_teams")
    .select("name")
    .eq("id", subTeamId)
    .maybeSingle()

  const teamName = team?.name ?? "your team"
  const sorted = [...dates].sort()
  const first = new Date(`${sorted[0]}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  await createNotification({
    userId,
    type: "user_assigned",
    title:
      dates.length === 1
        ? `You're on ${teamName} duty on ${first}`
        : `You're on ${teamName} duty for ${dates.length} days`,
    body:
      dates.length === 1
        ? undefined
        : `Starting ${first}. Open the calendar to see them all and confirm.`,
    entityType: "duty",
    entityId,
  })
}

/**
 * Roster one person across many dates at once — the monthly-schedule case.
 *
 * Dates already covered are skipped rather than failing the batch, so re-running an
 * assignment over an overlapping range tops it up instead of erroring. The count of
 * skipped days is returned so the UI can say what actually happened.
 */
export async function assignDutyBulk(input: {
  userId: string
  subTeamId: string
  dates: string[]
  roleTitle?: string
  callTime?: string
}) {
  const guard = await requireScheduler()
  if (!guard.ok) return { error: guard.error }
  if (input.dates.length === 0) return { error: "Pick at least one date" }

  const supabase = await createClient()

  // Link each date to that day's event where one exists, so the duty shows against the
  // service rather than floating on the date.
  const { data: events } = await supabase
    .from("events")
    .select("id, start_time")
    .gte("start_time", `${input.dates[0]}T00:00:00`)
    .lte("start_time", `${input.dates[input.dates.length - 1]}T23:59:59`)

  const eventByDate = new Map<string, string>()
  for (const e of events ?? []) {
    eventByDate.set(new Date(e.start_time).toISOString().slice(0, 10), e.id)
  }

  const rows = input.dates.map((d) => ({
    campus_id: guard.campusId,
    sub_team_id: input.subTeamId,
    user_id: input.userId,
    duty_date: d,
    event_id: eventByDate.get(d) ?? null,
    role_title: input.roleTitle ?? null,
    call_time: input.callTime ?? null,
    created_by: guard.userId,
  }))

  const { data, error } = await supabase
    .from("duty_assignments")
    .upsert(rows, {
      onConflict: "user_id,sub_team_id,duty_date",
      ignoreDuplicates: true,
    })
    .select("id")

  if (error) return { error: error.message }

  const added = data?.length ?? 0
  // Only notify about days actually added — re-running over an overlapping range
  // shouldn't tell someone again about duties they already have.
  if (added > 0 && data?.[0]) {
    await notifyRostered(input.userId, input.subTeamId, input.dates.slice(0, added), data[0].id)
  }

  revalidatePath("/calendar")
  return { success: true, added, skipped: input.dates.length - added }
}

export async function removeDuty(dutyId: string) {
  const guard = await requireScheduler()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { error } = await supabase.from("duty_assignments").delete().eq("id", dutyId)

  if (error) return { error: error.message }
  revalidatePath("/calendar")
  return { success: true }
}

/**
 * Respond to your own duty.
 *
 * Not behind requireScheduler: accepting or declining your own roster is exactly what
 * a member must be able to do. The row filter is the gate — you can only ever change a
 * row that names you.
 */
export async function respondToDuty(dutyId: string, status: Extract<DutyStatus, "confirmed" | "declined">) {
  const profile = await getCurrentUserWithRole()
  if (!profile) return { error: "Not signed in" }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("duty_assignments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", dutyId)
    .eq("user_id", profile.id)
    .select("id, duty_date, created_by, sub_teams:sub_team_id(name)")
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: "That duty is not yours to respond to" }

  /**
   * A decline leaves a hole in the rota, and the person who filled it is the one who
   * has to find a replacement — so they get told. Confirmations are deliberately
   * silent: a lead who hears about every acceptance stops reading the feed, and then
   * misses the declines that actually need action.
   */
  if (status === "declined" && data.created_by && data.created_by !== profile.id) {
    const team = (data as unknown as { sub_teams?: { name?: string } }).sub_teams?.name ?? "a team"
    const when = new Date(`${data.duty_date}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    })

    await createNotification({
      userId: data.created_by,
      type: "assignment_declined",
      title: `${profile.full_name} declined ${team} duty`,
      body: `${when} now needs cover.`,
      entityType: "duty",
      entityId: data.id,
    })
  }

  revalidatePath("/calendar")
  return { success: true }
}
