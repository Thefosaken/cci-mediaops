"use server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { hasPermission } from "@/lib/permissions"
import { revalidatePath } from "next/cache"
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
  const { error } = await supabase.from("duty_assignments").insert({
    campus_id: guard.campusId,
    sub_team_id: input.subTeamId,
    user_id: input.userId,
    duty_date: input.dutyDate,
    event_id: input.eventId ?? null,
    role_title: input.roleTitle ?? null,
    call_time: input.callTime ?? null,
    created_by: guard.userId,
  })

  if (error) {
    if (error.code === "23505") return { error: "They are already on that team that day" }
    return { error: error.message }
  }

  revalidatePath("/calendar")
  return { success: true }
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
  const { error, count } = await supabase
    .from("duty_assignments")
    .update({ status, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", dutyId)
    .eq("user_id", profile.id)

  if (error) return { error: error.message }
  if (!count) return { error: "That duty is not yours to respond to" }

  revalidatePath("/calendar")
  return { success: true }
}
