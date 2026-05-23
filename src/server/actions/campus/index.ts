"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function createCampus(data: { name: string; location?: string }) {
  const supabase = await createClient()
  const { error } = await supabase.from("campuses").insert(data)
  if (error) return { error: error.message }
  revalidatePath("/settings")
  return { success: true }
}

export async function updateCampus(id: string, data: Record<string, unknown>) {
  const supabase = await createClient()
  const { error } = await supabase.from("campuses").update(data).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/settings")
  return { success: true }
}

export async function getCampusOverview(campusId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("campuses")
    .select("*, sub_teams(*), users:campus_memberships(*)")
    .eq("id", campusId)
    .single()
  if (error) return { error: error.message }
  return { data }
}
