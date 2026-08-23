"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient, adminClientConfigured } from "@/lib/supabase/admin"
import { cleanSerial } from "@/lib/ocr/clean"

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

/**
 * Server-side OCR. The phone uploads a small (downscaled) image and we read the
 * serial here — nothing heavy runs on the device. Authorized either by a signed-in
 * user (the mobile-direct path) or a valid scan token (the public /scan page).
 */
export async function ocrSerialImage(
  formData: FormData,
): Promise<{ text: string } | { error: string }> {
  const token = (formData.get("token") as string | null) ?? null
  const image = formData.get("image")
  if (!(image instanceof Blob)) return { error: "No image received" }
  if (image.size > 3_000_000) return { error: "Image too large" }

  // Authorize: a signed-in user, or a valid scan token.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    if (!token) return { error: "Not authorized" }
    const check = await getScanSession(token)
    if (!check.valid || check.expired) return { error: "This scan link is invalid or expired." }
  }

  try {
    const buffer = Buffer.from(await image.arrayBuffer())
    const { createWorker } = await import("tesseract.js")
    const worker = await createWorker("eng", 1, { cachePath: "/tmp" })
    try {
      const { data } = await worker.recognize(buffer)
      return { text: cleanSerial(data.text) }
    } finally {
      await worker.terminate()
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "OCR failed" }
  }
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
