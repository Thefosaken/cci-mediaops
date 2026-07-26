"use server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { hasPermission } from "@/lib/permissions"
import { planCascade, type TimelineSession, type CascadePlan } from "@/lib/utils/run-sheet-timeline"
import { revalidatePath } from "next/cache"
import type { UserRole } from "@/types"

/**
 * Run sheet session actions.
 *
 * RLS on these tables is permissive by project convention (see CLAUDE.md — "gates live
 * in the application layer"), so every mutation below must check permission itself.
 * Nothing else will stop a team_member writing here.
 */

type Guard = { ok: true; role: UserRole } | { ok: false; error: string }

async function requireEdit(): Promise<Guard> {
  const profile = await getCurrentUserWithRole()
  if (!profile) return { ok: false, error: "Not signed in" }

  const memberships = profile.campus_memberships as
    | { roles: { name: UserRole } | null }[]
    | undefined
  const role = memberships?.[0]?.roles?.name

  if (!role) return { ok: false, error: "No role assigned" }
  if (!hasPermission(role, "run_sheets", "edit")) {
    return { ok: false, error: "You do not have permission to edit run sheets" }
  }
  return { ok: true, role }
}

/** Placed sessions on a sheet, for overlap and cascade maths. */
async function loadTimeline(runSheetId: string): Promise<TimelineSession[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("run_sheet_sessions")
    .select("id, name, start_time, end_time")
    .eq("run_sheet_id", runSheetId)
    .not("start_time", "is", null)
    .order("start_time")

  return (data ?? []) as TimelineSession[]
}

/**
 * Create a session. Cues are prepopulated with one empty row per active sub-team, which
 * is what makes the collapsed cue section in the form reflect the campus's actual units.
 *
 * Times are optional: omit them to create the session parked in the tray.
 */
export async function createSession(input: {
  runSheetId: string
  name: string
  startTime?: string
  endTime?: string
  sessionType?: string
  notes?: string
  memberIds?: string[]
}) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const placed = Boolean(input.startTime && input.endTime)
  if (placed && new Date(input.endTime!) <= new Date(input.startTime!)) {
    return { error: "End time must be after start time" }
  }

  const supabase = await createClient()

  const { data: session, error } = await supabase
    .from("run_sheet_sessions")
    .insert({
      run_sheet_id: input.runSheetId,
      name: input.name,
      start_time: placed ? input.startTime : null,
      end_time: placed ? input.endTime : null,
      session_type: input.sessionType ?? null,
      notes: input.notes ?? null,
    })
    .select("id, run_sheet_id")
    .single()

  if (error) {
    // 23P01 is the exclusion constraint: something already occupies that interval.
    if (error.code === "23P01") {
      return { error: "That time overlaps an existing session" }
    }
    return { error: error.message }
  }

  // Sheet -> campus -> active sub-teams, so cues mirror the units this campus actually has.
  const { data: sheet } = await supabase
    .from("run_sheets")
    .select("campus_id")
    .eq("id", input.runSheetId)
    .single()

  if (sheet?.campus_id) {
    const { data: subTeams } = await supabase
      .from("sub_teams")
      .select("id")
      .eq("campus_id", sheet.campus_id)
      .eq("status", "active")

    if (subTeams?.length) {
      await supabase.from("run_sheet_session_cues").insert(
        subTeams.map((st) => ({ session_id: session.id, sub_team_id: st.id, cue_text: null }))
      )
    }
  }

  if (input.memberIds?.length) {
    await supabase.from("run_sheet_session_members").insert(
      input.memberIds.map((userId) => ({ session_id: session.id, user_id: userId }))
    )
  }

  revalidatePath("/run-sheets")
  return { success: true, sessionId: session.id }
}

/**
 * Work out what retiming a session would do, without touching anything.
 *
 * The UI shows this to the user before committing, so a cascade that shunts six sessions
 * into the evening is a visible decision rather than a silent one.
 */
export async function previewRetime(
  runSheetId: string,
  sessionId: string,
  startTime: string,
  endTime: string
): Promise<{ plan: CascadePlan } | { error: string }> {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const timeline = await loadTimeline(runSheetId)

  // A parked session being placed isn't on the timeline yet; treat it as starting where
  // it is being dropped so the cascade walk has an anchor.
  const known = timeline.some((s) => s.id === sessionId)
  const sessions = known
    ? timeline
    : [...timeline, { id: sessionId, name: "", start_time: startTime, end_time: endTime }]

  try {
    return { plan: planCascade(sessions, sessionId, startTime, endTime) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not plan the change" }
  }
}

/**
 * Commit a retime and its cascade.
 *
 * Recomputes the plan server-side rather than trusting the client's — the sheet may have
 * changed since the preview was rendered, and a stale plan would move the wrong things.
 */
export async function applyRetime(
  runSheetId: string,
  sessionId: string,
  startTime: string,
  endTime: string
) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const timeline = await loadTimeline(runSheetId)
  const known = timeline.some((s) => s.id === sessionId)
  const sessions = known
    ? timeline
    : [...timeline, { id: sessionId, name: "", start_time: startTime, end_time: endTime }]

  let plan: CascadePlan
  try {
    plan = planCascade(sessions, sessionId, startTime, endTime)
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not plan the change" }
  }

  if (plan.conflicts.length > 0) {
    const names = plan.conflicts.map((c) => c.name).join(", ")
    return { error: `That time runs into an earlier session: ${names}` }
  }

  const moves = [plan.target, ...plan.moves].map((m) => ({
    id: m.id,
    start_time: m.toStart,
    end_time: m.toEnd,
  }))

  const supabase = await createClient()
  const { error } = await supabase.rpc("apply_session_cascade", {
    p_run_sheet_id: runSheetId,
    p_moves: moves,
  })

  if (error) return { error: error.message }

  revalidatePath("/run-sheets")
  return { success: true, moved: plan.moves.length }
}

/** Return a session to the tray, freeing its slot. */
export async function parkSession(sessionId: string) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from("run_sheet_sessions")
    .update({ start_time: null, end_time: null, updated_at: new Date().toISOString() })
    .eq("id", sessionId)

  if (error) return { error: error.message }
  revalidatePath("/run-sheets")
  return { success: true }
}

export async function deleteSession(sessionId: string) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { error } = await supabase.from("run_sheet_sessions").delete().eq("id", sessionId)

  if (error) return { error: error.message }
  revalidatePath("/run-sheets")
  return { success: true }
}

/** Advance a session's lifecycle during live mode. */
export async function setSessionStatus(
  sessionId: string,
  status: "upcoming" | "active" | "completed" | "skipped"
) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from("run_sheet_sessions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", sessionId)

  if (error) return { error: error.message }
  revalidatePath("/run-sheets")
  return { success: true }
}

/** Flip the whole sheet between draft, live and completed. */
export async function setRunSheetStatus(
  runSheetId: string,
  status: "draft" | "confirmed" | "live" | "completed"
) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from("run_sheets")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", runSheetId)

  if (error) return { error: error.message }
  revalidatePath("/run-sheets")
  return { success: true }
}

export async function setCue(sessionId: string, subTeamId: string, cueText: string) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from("run_sheet_session_cues")
    .upsert(
      { session_id: sessionId, sub_team_id: subTeamId, cue_text: cueText || null },
      { onConflict: "session_id,sub_team_id" }
    )

  if (error) return { error: error.message }
  revalidatePath("/run-sheets")
  return { success: true }
}

/**
 * The service a sheet belongs to, and who is rostered on it.
 *
 * Rostering happens weeks before anybody writes the running order, so by the time a
 * sheet exists the answer to "who is on this service" is already known. Re-typing it
 * per session is not just tedious — it is where the sheet and the rota drift apart,
 * and then two documents disagree about who is turning up.
 *
 * Only published duties count. A draft roster is still being argued over, and pulling
 * one into a run sheet would make it real by the back door.
 */
async function rosterForSheet(runSheetId: string) {
  const supabase = await createClient()

  const { data: sheet } = await supabase
    .from("run_sheets")
    .select("slot_id")
    .eq("id", runSheetId)
    .maybeSingle()

  if (!sheet?.slot_id) return []

  const { data } = await supabase
    .from("duty_assignments")
    .select("user_id, sub_team_id, role_title, call_time, status")
    .eq("slot_id", sheet.slot_id)
    .eq("publish_state", "published")

  // A declined duty names somebody who is not coming. Carrying them onto the sheet
  // would show the service as staffed by a person who already said no.
  return (data ?? []).filter((d) => d.status !== "declined" && d.status !== "swapped_out")
}

/** The run sheet a session sits on. */
async function sheetIdForSession(sessionId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("run_sheet_sessions")
    .select("run_sheet_id")
    .eq("id", sessionId)
    .maybeSingle()
  return data?.run_sheet_id ?? null
}

/**
 * Add one person to a session.
 *
 * When the person is already rostered for this sheet's service, their team, role, call
 * time and confirmation come across on their own. The caller cannot supply a
 * confirmation: it is read from the duty, so the only way a session member starts
 * `confirmed` is that the person actually accepted the service. Anything else would let
 * a sheet claim an acceptance nobody gave.
 *
 * Explicitly passed values still win, so a lead can say "on this session she's on
 * Camera 2" without the duty's role overwriting it.
 */
export async function addSessionMember(input: {
  sessionId: string
  userId?: string
  subTeamId?: string
  roleTitle?: string
  callTime?: string
}) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()

  let duty: Awaited<ReturnType<typeof rosterForSheet>>[number] | undefined
  if (input.userId) {
    const sheetId = await sheetIdForSession(input.sessionId)
    if (sheetId) {
      const roster = await rosterForSheet(sheetId)
      duty = roster.find((d) => d.user_id === input.userId)
    }
  }

  const { error } = await supabase.from("run_sheet_session_members").insert({
    session_id: input.sessionId,
    user_id: input.userId ?? null,
    sub_team_id: input.subTeamId ?? duty?.sub_team_id ?? null,
    role_title: input.roleTitle ?? duty?.role_title ?? null,
    call_time: input.callTime ?? null,
    confirmation_status: duty?.status === "confirmed" ? "confirmed" : "pending"
  })

  if (error) {
    if (error.code === "23505") return { error: "That person is already on this session" }
    return { error: error.message }
  }

  revalidatePath("/run-sheets")
  return { success: true, fromRoster: Boolean(duty) }
}

/**
 * Put everyone rostered for the service onto one session.
 *
 * The bulk form of the above, and the reason the two systems are worth connecting at
 * all: a lead who has already built the rota should not have to rebuild it a session
 * at a time. People already on the session are skipped rather than erroring, so this
 * tops up a partly-filled session instead of refusing to run twice.
 */
export async function fillSessionFromRoster(sessionId: string) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const sheetId = await sheetIdForSession(sessionId)
  if (!sheetId) return { error: "That session no longer exists" }

  const roster = await rosterForSheet(sheetId)
  if (roster.length === 0) {
    return { error: "Nobody is rostered for this service yet — schedule people on the calendar first" }
  }

  const supabase = await createClient()
  const { data: already } = await supabase
    .from("run_sheet_session_members")
    .select("user_id")
    .eq("session_id", sessionId)

  const present = new Set((already ?? []).map((m) => m.user_id).filter(Boolean))
  const missing = roster.filter((d) => !present.has(d.user_id))

  if (missing.length === 0) return { success: true, added: 0, alreadyOn: roster.length }

  const { error } = await supabase.from("run_sheet_session_members").insert(
    missing.map((d) => ({
      session_id: sessionId,
      user_id: d.user_id,
      sub_team_id: d.sub_team_id,
      role_title: d.role_title,
      call_time: d.call_time,
      // Carried, not assumed — see addSessionMember.
      confirmation_status: d.status === "confirmed" ? "confirmed" : "pending"
    }))
  )

  if (error) return { error: error.message }

  revalidatePath("/run-sheets")
  return { success: true, added: missing.length, alreadyOn: present.size }
}

export async function removeSessionMember(memberId: string) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { error } = await supabase.from("run_sheet_session_members").delete().eq("id", memberId)

  if (error) return { error: error.message }
  revalidatePath("/run-sheets")
  return { success: true }
}

/**
 * Confirm or decline your own assignment.
 *
 * Deliberately not behind requireEdit: responding to your own call is exactly what a
 * team_member must be able to do. The row filter is the gate — you can only ever change
 * a row that names you.
 */
export async function respondToAssignment(
  memberId: string,
  response: "confirmed" | "declined"
) {
  const profile = await getCurrentUserWithRole()
  if (!profile) return { error: "Not signed in" }

  const supabase = await createClient()
  const { error, count } = await supabase
    .from("run_sheet_session_members")
    .update({ confirmation_status: response, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", memberId)
    .eq("user_id", profile.id)

  if (error) return { error: error.message }
  if (!count) return { error: "That assignment is not yours to respond to" }

  revalidatePath("/run-sheets")
  return { success: true }
}

export async function markAttendance(
  memberId: string,
  status: "present" | "absent" | "late" | "excused"
) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from("run_sheet_session_members")
    .update({ attendance_status: status, updated_at: new Date().toISOString() })
    .eq("id", memberId)

  if (error) return { error: error.message }
  revalidatePath("/run-sheets")
  return { success: true }
}
