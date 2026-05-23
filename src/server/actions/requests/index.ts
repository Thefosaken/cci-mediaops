"use server"

import { createClient } from "@/lib/supabase/server"
import { requestSchema } from "@/lib/validators"
import type { RequestInput } from "@/lib/validators"
import { revalidatePath } from "next/cache"

export async function submitRequest(input: RequestInput) {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() }
  }

  const supabase = await createClient()
  const { data: request, error } = await supabase
    .from("requests")
    .insert({
      title: parsed.data.title,
      requesting_unit: parsed.data.requestingUnit,
      event_id: parsed.data.eventId,
      description: parsed.data.description,
      desired_output: parsed.data.desiredOutput,
      deadline: parsed.data.deadline,
      priority: parsed.data.priority,
      approval_required: parsed.data.approvalRequired,
      approver_id: parsed.data.approverId,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  if (request && parsed.data.subTeamIds.length > 0) {
    const subTeamRecords = parsed.data.subTeamIds.map((subTeamId) => ({
      request_id: request.id,
      sub_team_id: subTeamId,
    }))
    await supabase.from("request_sub_teams").insert(subTeamRecords)
  }

  revalidatePath("/requests")
  return { data: request }
}

export async function routeRequestToSubTeams(
  requestId: string,
  subTeamIds: string[]
) {
  const supabase = await createClient()
  const records = subTeamIds.map((subTeamId) => ({
    request_id: requestId,
    sub_team_id: subTeamId,
  }))
  const { error } = await supabase.from("request_sub_teams").insert(records)
  if (error) return { error: error.message }
  revalidatePath("/requests")
  return { success: true }
}

export async function updateRequestStatus(requestId: string, status: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("requests")
    .update({ status })
    .eq("id", requestId)
  if (error) return { error: error.message }
  revalidatePath("/requests")
  return { success: true }
}

export async function requestClarification(
  requestId: string,
  question: string
) {
  const supabase = await createClient()
  const { error: reqError } = await supabase
    .from("requests")
    .update({ status: "clarification_needed" })
    .eq("id", requestId)
  if (reqError) return { error: reqError.message }

  const { error: commentError } = await supabase.from("comments").insert({
    entity_type: "request",
    entity_id: requestId,
    body: `Clarification needed: ${question}`,
  })
  if (commentError) return { error: commentError.message }

  revalidatePath("/requests")
  return { success: true }
}

export async function completeRequest(requestId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("requests")
    .update({ status: "completed" })
    .eq("id", requestId)
  if (error) return { error: error.message }
  revalidatePath("/requests")
  return { success: true }
}
