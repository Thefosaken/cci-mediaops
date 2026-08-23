"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient, adminClientConfigured } from "@/lib/supabase/admin"

/**
 * Desktop-to-phone serial scanning. The desktop creates a session and shows a
 * QR; the phone opens /scan/<token>, reads the serial on-device, and writes the
 * text back through the service-role client (it is not signed in). The desktop
 * is subscribed to the row over Realtime and fills the field when it lands.
 */

// Created by the signed-in desktop user.
export async function createScanSession(): Promise<{ token: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return { error: "Not authenticated" }

  const { data: profile } = await supabase
    .from("users").select("id").eq("auth_user_id", authUser.id).maybeSingle()

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "")
  const { error } = await supabase
    .from("scan_sessions")
    .insert({ token, created_by: profile?.id ?? null })
  if (error) return { error: error.message }
  return { token }
}

interface ScanSessionRow {
  id: string
  status: string
  expires_at: string
}

// Called from the public phone page — no auth, so it goes through service-role.
export async function submitScanResult(
  token: string,
  text: string,
): Promise<{ success: true } | { error: string }> {
  const clean = text.trim().slice(0, 64)
  if (!token || !clean) return { error: "Nothing to submit" }
  if (!adminClientConfigured()) return { error: "Scanning isn't configured on this deployment." }

  const admin = createAdminClient()

  const found = await admin
    .from("scan_sessions")
    .select("id, status, expires_at")
    .eq("token", token)
    .maybeSingle()
  const session = found.data as unknown as ScanSessionRow | null

  if (!session) return { error: "This scan link is invalid." }
  if (new Date(session.expires_at) <= new Date()) return { error: "This scan link has expired." }

  const { error } = await admin
    .from("scan_sessions")
    .update({ result: clean, status: "completed" } as never)
    .eq("token", token)
  if (error) return { error: error.message }

  return { success: true }
}

// Read a session's status/validity for the public phone page (service-role).
export async function getScanSession(
  token: string,
): Promise<{ valid: boolean; expired: boolean }> {
  if (!adminClientConfigured()) return { valid: false, expired: false }
  const admin = createAdminClient()
  const found = await admin
    .from("scan_sessions")
    .select("id, status, expires_at")
    .eq("token", token)
    .maybeSingle()
  const session = found.data as unknown as ScanSessionRow | null
  if (!session) return { valid: false, expired: false }
  return { valid: true, expired: new Date(session.expires_at) <= new Date() }
}
