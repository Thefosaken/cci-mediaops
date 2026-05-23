"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function createSubTeam(data: { campusId: string; name: string; description?: string }) {
  const supabase = await createClient()
  const { error } = await supabase.from("sub_teams").insert({
    campus_id: data.campusId,
    name: data.name,
    description: data.description,
  })
  if (error) return { error: error.message }
  revalidatePath("/sub-teams")
  return { success: true }
}

export async function updateSubTeam(id: string, data: Record<string, unknown>) {
  const supabase = await createClient()
  const { error } = await supabase.from("sub_teams").update(data).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/sub-teams")
  return { success: true }
}

export async function addSubTeamMember(subTeamId: string, userId: string, roleId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("sub_team_memberships").insert({
    sub_team_id: subTeamId,
    user_id: userId,
    role_id: roleId,
  })
  if (error) return { error: error.message }
  revalidatePath("/sub-teams")
  return { success: true }
}

export async function removeSubTeamMember(subTeamId: string, userId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("sub_team_memberships")
    .delete()
    .eq("sub_team_id", subTeamId)
    .eq("user_id", userId)
  if (error) return { error: error.message }
  revalidatePath("/sub-teams")
  return { success: true }
}

export async function assignSubTeamLead(subTeamId: string, userId: string) {
  const supabase = await createClient()
  const { data: leadRole } = await supabase
    .from("roles")
    .select("id")
    .eq("name", "sub_team_lead")
    .single()

  if (leadRole) {
    const { error } = await supabase
      .from("sub_team_memberships")
      .update({ role_id: leadRole.id })
      .eq("sub_team_id", subTeamId)
      .eq("user_id", userId)
    if (error) return { error: error.message }
  }
  revalidatePath("/sub-teams")
  return { success: true }
}
