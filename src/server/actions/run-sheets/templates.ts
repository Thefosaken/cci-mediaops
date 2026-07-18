"use server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { hasPermission } from "@/lib/permissions"
import { revalidatePath } from "next/cache"
import type { UserRole } from "@/types"

/**
 * Run sheet creation, duplication and templates.
 *
 * The copy itself happens in the duplicate_run_sheet function (migration 00015) — it
 * spans four tables and needs to be atomic. These actions handle permission and naming.
 */

async function requireEdit(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const profile = await getCurrentUserWithRole()
  if (!profile) return { ok: false, error: "Not signed in" }

  const memberships = profile.campus_memberships as
    | { campus_id: string; roles: { name: UserRole } | null }[]
    | undefined
  const role = memberships?.[0]?.roles?.name

  if (!role) return { ok: false, error: "No role assigned" }
  if (!hasPermission(role, "run_sheets", "create")) {
    return { ok: false, error: "You do not have permission to create run sheets" }
  }
  return { ok: true, userId: profile.id }
}

/**
 * Create a run sheet. An event is optional now — a sheet can stand alone, which is the
 * whole point of decoupling it from scheduling.
 */
export async function createStandaloneRunSheet(input: {
  title: string
  eventId?: string
  sheetDate?: string
  isTemplate?: boolean
}) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()

  // A standalone sheet has no event to inherit a campus from, so resolve it directly.
  const { data: membership } = await supabase
    .from("campus_memberships")
    .select("campus_id")
    .eq("user_id", guard.userId)
    .eq("status", "active")
    .maybeSingle()

  if (!membership?.campus_id) return { error: "No active campus membership" }

  const { data, error } = await supabase
    .from("run_sheets")
    .insert({
      title: input.title,
      event_id: input.eventId ?? null,
      campus_id: membership.campus_id,
      sheet_date: input.sheetDate ?? null,
      is_template: input.isTemplate ?? false,
      status: "draft",
      created_by: guard.userId,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/run-sheets")
  return { success: true, id: data.id }
}

/** Copy a sheet as-is, for editing without disturbing the original. */
export async function duplicateRunSheet(sourceId: string, title: string) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("duplicate_run_sheet", {
    p_source_id: sourceId,
    p_title: title,
    p_as_template: false,
    p_target_date: null,
  })

  if (error) return { error: error.message }

  revalidatePath("/run-sheets")
  return { success: true, id: data as string }
}

/** Save a sheet's structure for reuse. Templates are listed separately from real sheets. */
export async function saveAsTemplate(sourceId: string, title: string) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("duplicate_run_sheet", {
    p_source_id: sourceId,
    p_title: title,
    p_as_template: true,
    p_target_date: null,
  })

  if (error) return { error: error.message }

  revalidatePath("/run-sheets")
  return { success: true, id: data as string }
}

/**
 * Start a new sheet from a template, rebased onto the given date.
 *
 * Sessions shift by whole days, so clock times and the gaps between sessions survive
 * intact — a 7:30 session is still 7:30, and one that ran past midnight still does.
 */
export async function createFromTemplate(
  templateId: string,
  title: string,
  targetDate: string
) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("duplicate_run_sheet", {
    p_source_id: templateId,
    p_title: title,
    p_as_template: false,
    p_target_date: targetDate,
  })

  if (error) return { error: error.message }

  revalidatePath("/run-sheets")
  return { success: true, id: data as string }
}

/**
 * Delete a run sheet, with everything on it.
 *
 * The foreign keys cascade, so this also removes every session, cue and member
 * assignment. Gated on the `delete` permission, which in the current matrix is
 * super_admin only — leads and media admins can build and edit sheets but not destroy
 * them.
 */
export async function deleteRunSheet(runSheetId: string) {
  const profile = await getCurrentUserWithRole()
  if (!profile) return { error: "Not signed in" }

  const memberships = profile.campus_memberships as
    | { roles: { name: UserRole } | null }[]
    | undefined
  const role = memberships?.[0]?.roles?.name

  if (!role) return { error: "No role assigned" }
  if (!hasPermission(role, "run_sheets", "delete")) {
    return { error: "Only an administrator can delete a run sheet" }
  }

  const supabase = await createClient()
  const { error, count } = await supabase
    .from("run_sheets")
    .delete({ count: "exact" })
    .eq("id", runSheetId)

  if (error) return { error: error.message }
  if (!count) return { error: "That run sheet no longer exists" }

  revalidatePath("/run-sheets")
  return { success: true }
}

export async function deleteTemplate(templateId: string) {
  const guard = await requireEdit()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  // Scoped to templates so this can never delete a live run sheet by mistake.
  const { error, count } = await supabase
    .from("run_sheets")
    .delete({ count: "exact" })
    .eq("id", templateId)
    .eq("is_template", true)

  if (error) return { error: error.message }
  if (!count) return { error: "That template no longer exists" }

  revalidatePath("/run-sheets")
  return { success: true }
}
