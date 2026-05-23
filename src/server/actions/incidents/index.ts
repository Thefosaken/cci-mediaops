"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function reportIncident(data: {
  eventId?: string
  subTeamId?: string
  incidentType: string
  severity: string
  description: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.from("incidents").insert({
    event_id: data.eventId,
    sub_team_id: data.subTeamId,
    incident_type: data.incidentType,
    severity: data.severity,
    description: data.description,
    status: "open",
  })
  if (error) return { error: error.message }
  revalidatePath("/incidents")
  return { success: true }
}

export async function updateIncidentStatus(
  incidentId: string,
  status: string
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("incidents")
    .update({ status })
    .eq("id", incidentId)
  if (error) return { error: error.message }
  revalidatePath("/incidents")
  return { success: true }
}

export async function resolveIncident(incidentId: string, resolutionNotes: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("incidents")
    .update({
      status: "resolved",
      resolution_notes: resolutionNotes,
    })
    .eq("id", incidentId)
  if (error) return { error: error.message }
  revalidatePath("/incidents")
  return { success: true }
}
