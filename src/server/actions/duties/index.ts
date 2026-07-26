"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { canPublishRoster, hasPermission, seesAllTeams } from "@/lib/permissions"
import { createNotification } from "@/lib/notifications"
import type { DutyStatus, UserRole } from "@/types"

/**
 * Duty rostering — who is on which team, on which day, for which service.
 *
 * RLS is permissive by project convention (CLAUDE.md), so every mutation checks
 * permission itself. Two gates, not one:
 *
 *   · `schedules.create` — may roster at all
 *   · membership of the team — a lead rosters their own people, not someone else's
 *
 * The second is the one that matters day to day, and it is enforced here rather than
 * only in the UI, because a lead who can see the whole campus in a picker can also
 * post to it.
 *
 * Double-booking is caught by the database (`duty_no_double_booking`, migration
 * 00022). Postgres error 23P01 is that constraint firing; it is translated into a
 * sentence rather than surfaced raw.
 */

type Guard =
  | { ok: true; role: UserRole; userId: string; campusId: string; myTeamIds: string[] }
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

  const supabase = await createClient()
  const { data: teams } = await supabase
    .from("sub_team_memberships")
    .select("sub_team_id")
    .eq("user_id", profile.id)
    .eq("status", "active")

  return {
    ok: true,
    role,
    userId: profile.id,
    campusId: first.campus_id,
    myTeamIds: (teams ?? []).map((t) => t.sub_team_id)
  }
}

/** Whether this scheduler may roster into this particular team. */
function canRosterInto(guard: Extract<Guard, { ok: true }>, subTeamId: string): boolean {
  return seesAllTeams(guard.role) || guard.myTeamIds.includes(subTeamId)
}

const OUTSIDE_TEAM = "You can only schedule people into your own team"

/**
 * Turn a Postgres write failure into something a lead can act on.
 *
 * 23P01 is the exclusion constraint: this person already has a duty covering that
 * service. Naming them is worth the extra query — "someone is double-booked" sends a
 * lead hunting through the month.
 */
async function explainWriteError(
  error: { code?: string; message: string },
  context?: { userId: string; dutyDate: string }
): Promise<string> {
  if (error.code !== "23P01") {
    if (error.code === "23505") return "That duty already exists"
    return error.message
  }

  if (!context) return "They are already rostered for that service"

  const supabase = await createClient()
  const { data } = await supabase
    .from("duty_assignments")
    .select("slot_no, sub_teams:sub_team_id(name), users:user_id(full_name), event_slots:slot_id(label)")
    .eq("user_id", context.userId)
    .eq("duty_date", context.dutyDate)
    .limit(1)
    .maybeSingle()

  const row = data as unknown as {
    slot_no: number | null
    sub_teams?: { name?: string }
    users?: { full_name?: string }
    event_slots?: { label?: string }
  } | null

  const who = row?.users?.full_name ?? "They"
  const team = row?.sub_teams?.name ?? "another team"

  if (!row) return "They are already rostered for that service"
  if (row.slot_no === null) return `${who} is already on ${team} all day`

  const where = row.event_slots?.label ?? "that service"
  return `${who} is already on ${team} for ${where}`
}

/* ── Rostering ──────────────────────────────────────────────────────────── */

/**
 * Put one person on one service, or on a whole day when `slotId` is omitted.
 *
 * `duty_date` is set from the slot by trigger when there is one, so the caller's date
 * cannot drift from the service it names.
 */
export async function assignDuty(input: {
  userId: string
  subTeamId: string
  dutyDate: string
  slotId?: string
  eventId?: string
  roleTitle?: string
  callTime?: string
  asDraft?: boolean
}) {
  const guard = await requireScheduler()
  if (!guard.ok) return { error: guard.error }
  if (!canRosterInto(guard, input.subTeamId)) return { error: OUTSIDE_TEAM }

  const draft = input.asDraft ?? false
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("duty_assignments")
    .insert({
      campus_id: guard.campusId,
      sub_team_id: input.subTeamId,
      user_id: input.userId,
      duty_date: input.dutyDate,
      slot_id: input.slotId ?? null,
      event_id: input.eventId ?? null,
      role_title: input.roleTitle ?? null,
      call_time: input.callTime ?? null,
      publish_state: draft ? "draft" : "published",
      published_at: draft ? null : new Date().toISOString(),
      created_by: guard.userId
    })
    .select("id")
    .single()

  if (error) {
    return { error: await explainWriteError(error, { userId: input.userId, dutyDate: input.dutyDate }) }
  }

  // A draft is not news yet. Telling someone about a roster that may still be rewritten
  // is how people stop trusting the notification.
  if (!draft) await notifyRostered(input.userId, input.subTeamId, [input.dutyDate], data.id)

  revalidatePath("/calendar")
  return { success: true, id: data.id }
}

/**
 * Roster one person across many services at once.
 *
 * Rows are inserted individually rather than as one batch: a single clash in a batch
 * insert fails the whole statement, and the useful answer to "put Ada on every Sunday
 * in August" is "done, except the 16th — she's on Sound that morning", not a blanket
 * refusal. Each rejection is reported with its reason.
 */
export async function assignToSlots(input: {
  userId: string
  subTeamId: string
  slotIds: string[]
  roleTitle?: string
  callTime?: string
  asDraft?: boolean
}) {
  const guard = await requireScheduler()
  if (!guard.ok) return { error: guard.error }
  if (!canRosterInto(guard, input.subTeamId)) return { error: OUTSIDE_TEAM }
  if (input.slotIds.length === 0) return { error: "Pick at least one service" }

  const supabase = await createClient()
  const draft = input.asDraft ?? false

  const { data: slots } = await supabase
    .from("event_slots")
    .select("id, slot_date, event_id")
    .in("id", input.slotIds)

  if (!slots?.length) return { error: "Those services no longer exist" }

  const added: string[] = []
  const dates: string[] = []
  const rejected: string[] = []

  for (const slot of slots) {
    const { data, error } = await supabase
      .from("duty_assignments")
      .insert({
        campus_id: guard.campusId,
        sub_team_id: input.subTeamId,
        user_id: input.userId,
        duty_date: slot.slot_date,
        slot_id: slot.id,
        event_id: slot.event_id,
        role_title: input.roleTitle ?? null,
        call_time: input.callTime ?? null,
        publish_state: draft ? "draft" : "published",
        published_at: draft ? null : new Date().toISOString(),
        created_by: guard.userId
      })
      .select("id")
      .single()

    if (error) {
      rejected.push(await explainWriteError(error, { userId: input.userId, dutyDate: slot.slot_date }))
      continue
    }

    added.push(data.id)
    dates.push(slot.slot_date)
  }

  if (added.length === 0) {
    return { error: rejected[0] ?? "Nothing could be scheduled" }
  }

  if (!draft) await notifyRostered(input.userId, input.subTeamId, dates, added[0])

  revalidatePath("/calendar")
  return { success: true, added: added.length, rejected }
}

/**
 * Roster one person across many whole days — the case where a date has no event yet.
 *
 * An all-day duty blocks every slot that day by design, so this is the blunt
 * instrument: useful for "Ada is on Projection every Sunday in August" before the
 * services are laid out, and superseded by slot-level rostering once they are.
 */
export async function assignDutyBulk(input: {
  userId: string
  subTeamId: string
  dates: string[]
  roleTitle?: string
  callTime?: string
  asDraft?: boolean
}) {
  const guard = await requireScheduler()
  if (!guard.ok) return { error: guard.error }
  if (!canRosterInto(guard, input.subTeamId)) return { error: OUTSIDE_TEAM }
  if (input.dates.length === 0) return { error: "Pick at least one date" }

  const supabase = await createClient()
  const draft = input.asDraft ?? false
  const sorted = [...input.dates].sort()

  // Link each date to that day's event where one exists, so the duty shows against the
  // service rather than floating on the date.
  const { data: events } = await supabase
    .from("events")
    .select("id, start_time")
    .gte("start_time", `${sorted[0]}T00:00:00`)
    .lte("start_time", `${sorted[sorted.length - 1]}T23:59:59`)

  const eventByDate = new Map<string, string>()
  for (const e of events ?? []) {
    eventByDate.set(new Date(e.start_time).toISOString().slice(0, 10), e.id)
  }

  const added: string[] = []
  const addedDates: string[] = []
  const rejected: string[] = []

  for (const date of sorted) {
    const { data, error } = await supabase
      .from("duty_assignments")
      .insert({
        campus_id: guard.campusId,
        sub_team_id: input.subTeamId,
        user_id: input.userId,
        duty_date: date,
        slot_id: null,
        event_id: eventByDate.get(date) ?? null,
        role_title: input.roleTitle ?? null,
        call_time: input.callTime ?? null,
        publish_state: draft ? "draft" : "published",
        published_at: draft ? null : new Date().toISOString(),
        created_by: guard.userId
      })
      .select("id")
      .single()

    if (error) {
      rejected.push(await explainWriteError(error, { userId: input.userId, dutyDate: date }))
      continue
    }

    added.push(data.id)
    addedDates.push(date)
  }

  if (added.length === 0) return { error: rejected[0] ?? "Nothing could be scheduled" }

  if (!draft) await notifyRostered(input.userId, input.subTeamId, addedDates, added[0])

  revalidatePath("/calendar")
  return { success: true, added: added.length, skipped: rejected.length, rejected }
}

/**
 * Copy a service's roster onto another.
 *
 * "Same people as last Sunday" is the single most repeated action in rostering, and
 * doing it by hand is where mistakes enter. People who would clash on the target are
 * skipped and named rather than silently dropped — a lead needs to know which two
 * gaps to fill, not that "9 of 11 copied".
 *
 * Roles and call times come across; confirmations do not. Accepting last week is not
 * accepting this week.
 */
export async function copyRosterToSlot(sourceSlotId: string, targetSlotId: string, options?: { asDraft?: boolean }) {
  const guard = await requireScheduler()
  if (!guard.ok) return { error: guard.error }
  if (sourceSlotId === targetSlotId) return { error: "That is the same service" }

  const supabase = await createClient()
  const draft = options?.asDraft ?? false

  const { data: target } = await supabase
    .from("event_slots")
    .select("id, slot_date, event_id")
    .eq("id", targetSlotId)
    .maybeSingle()

  if (!target) return { error: "That service no longer exists" }

  const { data: source } = await supabase
    .from("duty_assignments")
    .select("user_id, sub_team_id, role_title, call_time, users:user_id(full_name)")
    .eq("slot_id", sourceSlotId)

  if (!source?.length) return { error: "There is nobody on that service to copy" }

  const copied: string[] = []
  const skipped: string[] = []
  const dates: string[] = []
  let outsideTeam = 0

  for (const row of source) {
    if (!canRosterInto(guard, row.sub_team_id)) {
      outsideTeam += 1
      continue
    }

    const { data, error } = await supabase
      .from("duty_assignments")
      .insert({
        campus_id: guard.campusId,
        sub_team_id: row.sub_team_id,
        user_id: row.user_id,
        duty_date: target.slot_date,
        slot_id: target.id,
        event_id: target.event_id,
        role_title: row.role_title,
        call_time: row.call_time,
        publish_state: draft ? "draft" : "published",
        published_at: draft ? null : new Date().toISOString(),
        created_by: guard.userId
      })
      .select("id")
      .single()

    if (error) {
      const name = (row as unknown as { users?: { full_name?: string } }).users?.full_name ?? "Someone"
      skipped.push(error.code === "23P01" ? `${name} is already rostered that day` : `${name}: ${error.message}`)
      continue
    }

    copied.push(data.id)
    dates.push(target.slot_date)

    if (!draft) await notifyRostered(row.user_id, row.sub_team_id, [target.slot_date], data.id)
  }

  // A lead copying into a team they do not run should hear about it rather than
  // wonder why the count came up short.
  if (outsideTeam > 0) {
    skipped.push(`${outsideTeam} skipped — outside your team${outsideTeam === 1 ? "" : "s"}`)
  }

  if (copied.length === 0) return { error: skipped[0] ?? "Nothing could be copied" }

  revalidatePath("/calendar")
  return { success: true, copied: copied.length, skipped }
}

/* ── Draft and publish ──────────────────────────────────────────────────── */

/**
 * Make a batch of draft duties real.
 *
 * The point of drafts is that a half-built month stays private. Publishing sends one
 * notification per person covering everything they were given, not one per duty —
 * being put on four Sundays is one piece of news, and four rows would bury the rest of
 * someone's feed.
 *
 * Gated on `schedules.approve`, which an assistant lead does not hold: they draft, the
 * lead publishes. That split is the only thing making the review step meaningful.
 */
export async function publishRoster(scope: { from: string; to: string; subTeamIds?: string[] }) {
  const guard = await requireScheduler()
  if (!guard.ok) return { error: guard.error }
  if (!canPublishRoster(guard.role)) {
    return { error: "Only a lead or an administrator can publish a roster" }
  }

  const supabase = await createClient()

  let query = supabase
    .from("duty_assignments")
    .select("id, user_id, sub_team_id, duty_date")
    .eq("campus_id", guard.campusId)
    .eq("publish_state", "draft")
    .gte("duty_date", scope.from)
    .lte("duty_date", scope.to)

  // A lead publishes their own teams. Narrowing here rather than after the fetch keeps
  // one lead from publishing another's half-finished work.
  const teams = seesAllTeams(guard.role)
    ? scope.subTeamIds
    : (scope.subTeamIds ?? guard.myTeamIds).filter((id) => guard.myTeamIds.includes(id))

  if (teams?.length) query = query.in("sub_team_id", teams)
  else if (!seesAllTeams(guard.role)) return { error: "You have no teams to publish" }

  const { data: drafts, error } = await query
  if (error) return { error: error.message }
  if (!drafts?.length) return { error: "There is nothing waiting to be published" }

  const { error: updateError } = await supabase
    .from("duty_assignments")
    .update({ publish_state: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in("id", drafts.map((d) => d.id))

  if (updateError) return { error: updateError.message }

  // One message per person per team, carrying every date they were given.
  const batches = new Map<string, { userId: string; subTeamId: string; dates: string[]; anchor: string }>()
  for (const d of drafts) {
    const key = `${d.user_id}:${d.sub_team_id}`
    const found = batches.get(key)
    if (found) found.dates.push(d.duty_date)
    else batches.set(key, { userId: d.user_id, subTeamId: d.sub_team_id, dates: [d.duty_date], anchor: d.id })
  }

  for (const batch of batches.values()) {
    await notifyRostered(batch.userId, batch.subTeamId, batch.dates, batch.anchor)
  }

  revalidatePath("/calendar")
  return { success: true, published: drafts.length, notified: batches.size }
}

/** Pull a duty back into draft. Only ever used to undo a premature publish. */
export async function unpublishDuty(dutyId: string) {
  const guard = await requireScheduler()
  if (!guard.ok) return { error: guard.error }
  if (!canPublishRoster(guard.role)) {
    return { error: "Only a lead or an administrator can change a published roster" }
  }

  const supabase = await createClient()
  const { error, count } = await supabase
    .from("duty_assignments")
    .update({ publish_state: "draft", published_at: null, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", dutyId)

  if (error) return { error: error.message }
  if (!count) return { error: "That duty no longer exists" }

  revalidatePath("/calendar")
  return { success: true }
}

/** How much unpublished work is sitting in a window, per team. */
export async function countDrafts(scope: { from: string; to: string }) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("duty_assignments")
    .select("sub_team_id")
    .eq("publish_state", "draft")
    .gte("duty_date", scope.from)
    .lte("duty_date", scope.to)

  const byTeam = new Map<string, number>()
  for (const row of data ?? []) byTeam.set(row.sub_team_id, (byTeam.get(row.sub_team_id) ?? 0) + 1)

  return { total: data?.length ?? 0, byTeam: Object.fromEntries(byTeam) }
}

/* ── Editing and responding ─────────────────────────────────────────────── */

/**
 * Set or clear what someone is doing on a given day.
 *
 * Roles are per-duty rather than per-person, because the same person does different
 * jobs on different Sundays — overflow screen one week, lyrics the next. Scheduling
 * can happen without one and the role filled in later, which is the common shape: you
 * know who is on long before you know what they will be doing.
 */
export async function setDutyRole(dutyId: string, roleTitle: string) {
  const guard = await requireScheduler()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { data: duty } = await supabase
    .from("duty_assignments")
    .select("sub_team_id")
    .eq("id", dutyId)
    .maybeSingle()

  if (!duty) return { error: "That duty no longer exists" }
  if (!canRosterInto(guard, duty.sub_team_id)) return { error: OUTSIDE_TEAM }

  const { error } = await supabase
    .from("duty_assignments")
    .update({ role_title: roleTitle.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", dutyId)

  if (error) return { error: error.message }
  revalidatePath("/calendar")
  return { success: true }
}

/** Move a duty to another service within the same day, or off slots entirely. */
export async function moveDutyToSlot(dutyId: string, slotId: string | null) {
  const guard = await requireScheduler()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { data: duty } = await supabase
    .from("duty_assignments")
    .select("sub_team_id, user_id, duty_date")
    .eq("id", dutyId)
    .maybeSingle()

  if (!duty) return { error: "That duty no longer exists" }
  if (!canRosterInto(guard, duty.sub_team_id)) return { error: OUTSIDE_TEAM }

  const { error } = await supabase
    .from("duty_assignments")
    .update({ slot_id: slotId, updated_at: new Date().toISOString() })
    .eq("id", dutyId)

  if (error) {
    return { error: await explainWriteError(error, { userId: duty.user_id, dutyDate: duty.duty_date }) }
  }

  revalidatePath("/calendar")
  return { success: true }
}

export async function removeDuty(dutyId: string) {
  const guard = await requireScheduler()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { data: duty } = await supabase
    .from("duty_assignments")
    .select("sub_team_id")
    .eq("id", dutyId)
    .maybeSingle()

  if (!duty) return { error: "That duty no longer exists" }
  if (!canRosterInto(guard, duty.sub_team_id)) return { error: OUTSIDE_TEAM }

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
 * row that names you, and only one that has been published, since a draft is not yours
 * to see yet.
 */
export async function respondToDuty(
  dutyId: string,
  status: Extract<DutyStatus, "confirmed" | "declined">
) {
  const profile = await getCurrentUserWithRole()
  if (!profile) return { error: "Not signed in" }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("duty_assignments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", dutyId)
    .eq("user_id", profile.id)
    .eq("publish_state", "published")
    .select("id, duty_date, created_by, slot_no, sub_teams:sub_team_id(name), event_slots:slot_id(label)")
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
    const joined = data as unknown as {
      sub_teams?: { name?: string }
      event_slots?: { label?: string }
    }
    const team = joined.sub_teams?.name ?? "a team"
    const when = new Date(`${data.duty_date}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long"
    })
    const which = joined.event_slots?.label

    await createNotification({
      userId: data.created_by,
      type: "assignment_declined",
      title: `${profile.full_name} declined ${team} duty`,
      body: which ? `${when}, ${which} now needs cover.` : `${when} now needs cover.`,
      entityType: "duty",
      entityId: data.id
    })
  }

  revalidatePath("/calendar")
  return { success: true }
}

/* ── Notification ───────────────────────────────────────────────────────── */

/**
 * Tell someone they have been put on duty.
 *
 * One notification per batch rather than per day — being scheduled for four Sundays
 * is one piece of news, and four identical rows would bury everything else in their
 * feed. Failures are swallowed by createNotification, so a notification problem never
 * costs someone their roster.
 */
async function notifyRostered(userId: string, subTeamId: string, dates: string[], entityId: string) {
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
    month: "long"
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
    entityId
  })
}
