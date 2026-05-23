"use server"

import { createClient } from "@/lib/supabase/server"
import { eventSchema } from "@/lib/validators"
import type { EventInput } from "@/lib/validators"
import { revalidatePath } from "next/cache"

export async function createEvent(input: EventInput) {
  const parsed = eventSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("events").insert({
    title: parsed.data.title,
    event_type: parsed.data.eventType,
    description: parsed.data.description,
    location: parsed.data.location,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
  })
  if (error) return { error: error.message }
  revalidatePath("/calendar")
  return { success: true }
}

export async function updateEvent(id: string, data: Record<string, unknown>) {
  const supabase = await createClient()
  const { error } = await supabase.from("events").update(data).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/calendar")
  return { success: true }
}

export async function cancelEvent(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/calendar")
  return { success: true }
}

export async function getEventDetails(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("events")
    .select("*, schedule_slots(*), run_sheets(*), request_sub_teams(request_id)")
    .eq("id", id)
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function duplicateEventTemplate(id: string) {
  const supabase = await createClient()
  const { data: original } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single()

  if (!original) return { error: "Event not found" }

  const { title, event_type, description, location } = original
  const { error } = await supabase.from("events").insert({
    title: `${title} (Copy)`,
    event_type,
    description,
    location,
    status: "draft",
  })
  if (error) return { error: error.message }
  revalidatePath("/calendar")
  return { success: true }
}
