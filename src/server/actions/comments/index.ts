"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type CommentEntity = "request" | "task" | "incident" | "approval" | "event"

export interface Comment {
  id: string
  entity_type: string
  entity_id: string
  user_id: string | null
  body: string
  created_at: string
  user?: { full_name: string | null; email: string | null } | null
}

export async function listComments(entityType: CommentEntity, entityId: string): Promise<Comment[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("comments")
    .select("id, entity_type, entity_id, user_id, body, created_at, users:user_id(full_name, email)")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true })

  return (data ?? []).map((c) => {
    const userRaw = (c as unknown as { users?: unknown }).users
    const userObj = Array.isArray(userRaw) ? userRaw[0] : userRaw
    return {
      id: c.id as string,
      entity_type: c.entity_type as string,
      entity_id: c.entity_id as string,
      user_id: (c.user_id ?? null) as string | null,
      body: c.body as string,
      created_at: c.created_at as string,
      user: (userObj ?? null) as Comment["user"],
    }
  })
}

export async function addComment(
  entityType: CommentEntity,
  entityId: string,
  body: string
) {
  const trimmed = body.trim()
  if (!trimmed) return { success: false as const, error: "Comment cannot be empty" }
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return { success: false as const, error: "Not authenticated" }
  const { data: profile } = await supabase
    .from("users").select("id").eq("auth_user_id", authUser.id).single()

  const { error } = await supabase.from("comments").insert({
    entity_type: entityType,
    entity_id: entityId,
    user_id: profile?.id ?? null,
    body: trimmed,
  })
  if (error) return { success: false as const, error: error.message }
  revalidatePath(`/${entityType}s`)
  return { success: true as const }
}

export async function addAttachmentLink(
  entityType: CommentEntity,
  entityId: string,
  url: string,
  title?: string
) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("users").select("id").eq("auth_user_id", authUser?.id).single()
  const { error } = await supabase.from("attachment_links").insert({
    entity_type: entityType,
    entity_id: entityId,
    url,
    title: title || url,
    added_by: profile?.id ?? null,
  })
  if (error) return { success: false as const, error: error.message }
  revalidatePath(`/${entityType}s`)
  return { success: true as const }
}

export async function listAttachmentLinks(entityType: CommentEntity, entityId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("attachment_links")
    .select("id, url, title, file_type, created_at, added_by, users:added_by(full_name)")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
  return data ?? []
}
