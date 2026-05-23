"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function createScheduleSlot(data: {
  eventId: string
  subTeamId: string
  roleTitle: string
  callTime?: string
  startTime?: string
  endTime?: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.from("schedule_slots").insert({
    event_id: data.eventId,
    sub_team_id: data.subTeamId,
    role_title: data.roleTitle,
    call_time: data.callTime,
    start_time: data.startTime,
    end_time: data.endTime,
  })
  if (error) return { error: error.message }
  revalidatePath("/scheduling")
  return { success: true }
}

export async function assignUserToSlot(slotId: string, userId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("schedule_slots")
    .update({ assigned_user_id: userId })
    .eq("id", slotId)
  if (error) return { error: error.message }
  revalidatePath("/scheduling")
  return { success: true }
}

export async function confirmAssignment(slotId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("schedule_slots")
    .update({ confirmation_status: "confirmed" })
    .eq("id", slotId)
  if (error) return { error: error.message }
  revalidatePath("/scheduling")
  return { success: true }
}

export async function declineAssignment(slotId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("schedule_slots")
    .update({ confirmation_status: "declined" })
    .eq("id", slotId)
  if (error) return { error: error.message }
  revalidatePath("/scheduling")
  return { success: true }
}

export async function markAttendance(
  slotId: string,
  status: "present" | "absent" | "late" | "excused"
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("schedule_slots")
    .update({ attendance_status: status })
    .eq("id", slotId)
  if (error) return { error: error.message }
  revalidatePath("/scheduling")
  return { success: true }
}
