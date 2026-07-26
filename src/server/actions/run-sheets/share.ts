"use server"

import crypto from "crypto"
import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { hasPermission } from "@/lib/permissions"
import type { UserRole } from "@/types"

/**
 * Share links for a run sheet's live view.
 *
 * The link is a bearer credential — whoever holds it can read the sheet — so the
 * design leans on the token being unguessable and instantly revocable rather than
 * pretending it identifies anyone.
 *
 * Creating one is gated on `run_sheets.edit`: publishing a sheet outside the team is a
 * bigger act than viewing it, so a `team_member` who can read the sheet still cannot
 * hand it to the world.
 */

/** 24 chars over a 36-symbol alphabet ≈ 124 bits. Same shape as public request links. */
function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  const bytes = crypto.randomBytes(24)
  let out = ""
  for (let i = 0; i < 24; i++) out += chars[bytes[i] % chars.length]
  return out
}

type Guard =
  | { ok: true; userId: string; campusId: string }
  | { ok: false; error: string }

async function requireShare(): Promise<Guard> {
  const profile = await getCurrentUserWithRole()
  if (!profile) return { ok: false, error: "Not signed in" }

  const memberships = profile.campus_memberships as
    | { campus_id: string; roles: { name: UserRole } | null }[]
    | undefined
  const first = memberships?.[0]
  const role = first?.roles?.name

  if (!role || !first) return { ok: false, error: "No role assigned" }
  if (!hasPermission(role, "run_sheets", "edit")) {
    return { ok: false, error: "You do not have permission to share a run sheet" }
  }
  return { ok: true, userId: profile.id, campusId: first.campus_id }
}

export type ShareExpiry = "never" | "24h" | "7d"

function expiryFor(choice: ShareExpiry): string | null {
  if (choice === "never") return null
  const hours = choice === "24h" ? 24 : 24 * 7
  return new Date(Date.now() + hours * 3_600_000).toISOString()
}

/**
 * Create the sheet's live link, or hand back the one it already has.
 *
 * Idempotent by design: a partial unique index allows one active link per sheet, so a
 * second click returns the existing link rather than reporting a conflict at somebody
 * who only wanted to copy it again. Rotating is an explicit revoke-then-create.
 */
export async function createShareLink(runSheetId: string, options?: { expiry?: ShareExpiry; label?: string }) {
  const guard = await requireShare()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()

  const { data: sheet } = await supabase
    .from("run_sheets")
    .select("id, title, campus_id")
    .eq("id", runSheetId)
    .maybeSingle()

  if (!sheet) return { error: "That run sheet no longer exists" }

  const { data: existing } = await supabase
    .from("run_sheet_share_links")
    .select("token, expires_at")
    .eq("run_sheet_id", runSheetId)
    .eq("is_active", true)
    .maybeSingle()

  if (existing) return { success: true, token: existing.token, existed: true }

  const { data, error } = await supabase
    .from("run_sheet_share_links")
    .insert({
      run_sheet_id: runSheetId,
      campus_id: sheet.campus_id,
      token: generateToken(),
      label: options?.label?.trim() || sheet.title,
      expires_at: expiryFor(options?.expiry ?? "never"),
      created_by: guard.userId
    })
    .select("token")
    .single()

  if (error) return { error: error.message }

  revalidatePath(`/run-sheets/${runSheetId}`)
  return { success: true, token: data.token, existed: false }
}

/**
 * Kill the link.
 *
 * Deactivated rather than deleted, so who shared it and how often it was opened
 * survives the revocation — which is exactly the record wanted if a link turns up
 * somewhere it shouldn't have.
 */
export async function revokeShareLink(runSheetId: string) {
  const guard = await requireShare()
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { error, count } = await supabase
    .from("run_sheet_share_links")
    .update({ is_active: false, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("run_sheet_id", runSheetId)
    .eq("is_active", true)

  if (error) return { error: error.message }
  if (!count) return { error: "That sheet is not shared" }

  revalidatePath(`/run-sheets/${runSheetId}`)
  return { success: true }
}

/** Revoke and reissue in one step, for a link that has gone somewhere it shouldn't. */
export async function rotateShareLink(runSheetId: string, options?: { expiry?: ShareExpiry }) {
  const revoked = await revokeShareLink(runSheetId)
  // A sheet that was never shared can still be given its first link.
  if (revoked.error && revoked.error !== "That sheet is not shared") return { error: revoked.error }
  return createShareLink(runSheetId, options)
}
