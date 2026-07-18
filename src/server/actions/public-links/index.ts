"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import crypto from "crypto"

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  const bytes = crypto.randomBytes(24)
  for (let i = 0; i < 24; i++) {
    result += chars[bytes[i] % chars.length]
  }
  return result
}

export async function generatePublicLink(input: {
  label: string
  subTeamIds: string[]
}) {
  if (!input.label.trim()) return { error: "Label is required" }
  if (input.subTeamIds.length === 0) return { error: "At least one sub-team is required" }

  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return { error: "Not authenticated" }

  const { data: profile } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUser.id)
    .single()
  if (!profile) return { error: "User not found" }

  const { data: campus } = await supabase
    .from("campuses")
    .select("id")
    .limit(1)
    .single()
  if (!campus) return { error: "No campus found" }

  const { data: link, error } = await supabase
    .from("public_request_links")
    .insert({
      campus_id: campus.id,
      sub_team_ids: input.subTeamIds,
      created_by: profile.id,
      token: generateToken(),
      label: input.label.trim(),
      is_active: true,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath("/requests")
  revalidatePath("/settings")
  return { data: link }
}

export async function togglePublicLink(linkId: string, isActive: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("public_request_links")
    .update({ is_active: isActive })
    .eq("id", linkId)

  if (error) return { error: error.message }
  revalidatePath("/requests")
  revalidatePath("/settings")
  return { success: true }
}

export async function deletePublicLink(linkId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("public_request_links")
    .delete()
    .eq("id", linkId)

  if (error) return { error: error.message }
  revalidatePath("/requests")
  revalidatePath("/settings")
  return { success: true }
}

export async function getPublicLinks() {
  const supabase = await createClient()

  const { data: links, error } = await supabase
    .from("public_request_links")
    .select("*, created_by_user:created_by(full_name, email)")
    .order("created_at", { ascending: false })

  if (error) return { error: error.message }
  return { data: links }
}
