"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function markNotificationRead(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null)
  if (error) return { success: false as const, error: error.message }
  revalidatePath("/", "layout")
  return { success: true as const }
}

export async function markAllNotificationsRead(userId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null)
  if (error) return { success: false as const, error: error.message }
  revalidatePath("/", "layout")
  return { success: true as const }
}
