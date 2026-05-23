"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function submitForApproval(data: {
  requestId?: string
  taskId?: string
  approverId: string
  submittedLink?: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.from("approvals").insert({
    request_id: data.requestId,
    task_id: data.taskId,
    approver_id: data.approverId,
    submitted_link: data.submittedLink,
    status: "pending",
  })
  if (error) return { error: error.message }
  revalidatePath("/approvals")
  return { success: true }
}

export async function approveItem(approvalId: string, feedback?: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("approvals")
    .update({
      status: "approved",
      feedback,
      decided_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
  if (error) return { error: error.message }

  const { data: approval } = await supabase
    .from("approvals")
    .select("request_id, task_id")
    .eq("id", approvalId)
    .single()

  if (approval?.request_id) {
    await supabase
      .from("requests")
      .update({ status: "completed" })
      .eq("id", approval.request_id)
  }
  if (approval?.task_id) {
    await supabase
      .from("tasks")
      .update({ status: "completed" })
      .eq("id", approval.task_id)
  }

  revalidatePath("/approvals")
  return { success: true }
}

export async function requestChanges(approvalId: string, feedback: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("approvals")
    .update({
      status: "changes_requested",
      feedback,
      decided_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
  if (error) return { error: error.message }
  revalidatePath("/approvals")
  return { success: true }
}

export async function rejectItem(approvalId: string, reason: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("approvals")
    .update({
      status: "rejected",
      feedback: reason,
      decided_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
  if (error) return { error: error.message }
  revalidatePath("/approvals")
  return { success: true }
}
