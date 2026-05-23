"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function addEquipmentItem(data: {
  name: string
  subTeamId: string
  category?: string
  assetTag?: string
  serialNumber?: string
  description?: string
  conditionStatus?: string
  storageLocation?: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.from("equipment_items").insert({
    name: data.name,
    sub_team_id: data.subTeamId,
    category: data.category,
    asset_tag: data.assetTag,
    serial_number: data.serialNumber,
    description: data.description,
    condition_status: data.conditionStatus ?? "good",
    storage_location: data.storageLocation,
  })
  if (error) return { error: error.message }
  revalidatePath("/equipment")
  return { success: true }
}

export async function updateEquipmentItem(
  id: string,
  data: Record<string, unknown>
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("equipment_items")
    .update(data)
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/equipment")
  return { success: true }
}

export async function assignEquipmentToEvent(
  equipmentId: string,
  eventId: string,
  userId: string
) {
  const supabase = await createClient()
  const { error } = await supabase.from("equipment_assignments").insert({
    equipment_item_id: equipmentId,
    event_id: eventId,
    assigned_to_user_id: userId,
    status: "assigned",
  })
  if (error) return { error: error.message }

  await supabase
    .from("equipment_items")
    .update({ availability_status: "assigned", current_custodian_id: userId })
    .eq("id", equipmentId)

  revalidatePath("/equipment")
  return { success: true }
}

export async function checkOutEquipment(assignmentId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("equipment_assignments")
    .update({
      status: "checked_out",
      checkout_time: new Date().toISOString(),
    })
    .eq("id", assignmentId)
  if (error) return { error: error.message }

  const { data: assignment } = await supabase
    .from("equipment_assignments")
    .select("equipment_item_id")
    .eq("id", assignmentId)
    .single()

  if (assignment) {
    await supabase
      .from("equipment_items")
      .update({ availability_status: "checked_out" })
      .eq("id", assignment.equipment_item_id)
  }

  revalidatePath("/equipment")
  return { success: true }
}

export async function checkInEquipment(assignmentId: string, condition?: string) {
  const supabase = await createClient()
  const updateData: Record<string, unknown> = {
    status: "checked_in",
    checkin_time: new Date().toISOString(),
  }
  if (condition) updateData.checkin_condition = condition

  const { error } = await supabase
    .from("equipment_assignments")
    .update(updateData)
    .eq("id", assignmentId)
  if (error) return { error: error.message }

  const { data: assignment } = await supabase
    .from("equipment_assignments")
    .select("equipment_item_id")
    .eq("id", assignmentId)
    .single()

  if (assignment) {
    await supabase
      .from("equipment_items")
      .update({ availability_status: "available", current_custodian_id: null })
      .eq("id", assignment.equipment_item_id)
  }

  revalidatePath("/equipment")
  return { success: true }
}

export async function reportEquipmentIssue(
  equipmentId: string,
  issue: string
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("equipment_items")
    .update({ condition_status: "faulty", notes: issue })
    .eq("id", equipmentId)
  if (error) return { error: error.message }
  revalidatePath("/equipment")
  return { success: true }
}
