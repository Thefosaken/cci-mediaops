"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { publicRequestSchema } from "@/lib/validators"
import type { PublicRequestInput } from "@/lib/validators"
import crypto from "crypto"

function generateTrackingId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let result = "REQ-"
  const bytes = crypto.randomBytes(5)
  for (let i = 0; i < 5; i++) {
    result += chars[bytes[i] % chars.length]
  }
  return result
}

export async function getPublicLinkByToken(token: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("public_request_links" as never)
    .select("id, campus_id, sub_team_ids, label, is_active, expires_at, submission_count")
    .eq("token", token)
    .single()

  if (error || !data) return null
  const link = data as unknown as {
    id: string
    campus_id: string
    sub_team_ids: string[]
    label: string
    is_active: boolean
    expires_at: string | null
    submission_count: number
  }
  if (!link.is_active) return null
  if (link.expires_at && new Date(link.expires_at) < new Date()) return null
  return link
}

export async function submitPublicRequest(
  token: string,
  input: PublicRequestInput
) {
  const parsed = publicRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() }
  }

  const admin = createAdminClient()

  const link = await getPublicLinkByToken(token)
  if (!link) return { error: "Invalid or expired link" }

  const trackingId = generateTrackingId()

  const { data: request, error: reqError } = await (admin.from("requests" as never) as any)
    .insert({
      campus_id: link.campus_id,
      title: parsed.data.title,
      requesting_unit: parsed.data.requestingUnit,
      requester_id: null,
      requester_name: parsed.data.requesterName,
      requester_contact: parsed.data.requesterContact,
      public_request_link_id: link.id,
      tracking_id: trackingId,
      description: parsed.data.description || null,
      desired_output: parsed.data.desiredOutput || null,
      deadline: parsed.data.deadline || null,
      priority: parsed.data.priority,
      status: "submitted",
      approval_required: false,
    })
    .select()
    .single()

  if (reqError) return { error: reqError.message }

  if (link.sub_team_ids.length > 0) {
    const { error: subTeamError } = await (admin.from("request_sub_teams" as never) as any)
      .insert(
        link.sub_team_ids.map((stId: string) => ({
          request_id: request.id,
          sub_team_id: stId,
        }))
      )

    if (subTeamError) {
      console.error("Failed to assign sub-teams:", subTeamError.message)
    }
  }

  await admin.rpc("increment_public_link_count" as never, { link_id: link.id } as never)

  return {
    success: true,
    trackingId,
    requestId: request.id,
  }
}

export async function getRequestByTrackingId(trackingId: string) {
  const admin = createAdminClient()
  const { data, error } = await (admin.from("requests" as never) as any)
    .select("id, title, status, tracking_id, requester_name, created_at, request_sub_teams(sub_team_id, sub_teams(id, name))")
    .eq("tracking_id", trackingId)
    .single()

  if (error || !data) return null
  return data as {
    id: string
    title: string
    status: string
    tracking_id: string
    requester_name: string | null
    created_at: string
    request_sub_teams: { sub_team_id: string; sub_teams: { id: string; name: string } | null }[]
  }
}
