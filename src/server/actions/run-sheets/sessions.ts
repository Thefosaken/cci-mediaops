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
  const { error } = await supabase.from("run_sheet_session_members").insert({
    session_id: input.sessionId,
    user_id: input.userId ?? null,
    sub_team_id: input.subTeamId ?? null,
    role_title: input.roleTitle ?? null,
    call_time: input.callTime ?? null,
  })

  if (error) {
    if (error.code === "23505") return { error: "That person is already on this session" }
    return { error: error.message }
  }

  revalidatePath("/run-sheets")
  return { success: true }
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
