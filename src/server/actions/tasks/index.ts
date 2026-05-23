"use server"

import { createClient } from "@/lib/supabase/server"
import { taskSchema } from "@/lib/validators"
import type { TaskInput } from "@/lib/validators"
import { revalidatePath } from "next/cache"

export async function createTask(input: TaskInput) {
  const parsed = taskSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("tasks").insert({
    title: parsed.data.title,
    description: parsed.data.description,
    sub_team_id: parsed.data.subTeamId,
    assigned_user_id: parsed.data.assignedUserId,
    due_date: parsed.data.dueDate,
    priority: parsed.data.priority,
    request_id: parsed.data.requestId,
    event_id: parsed.data.eventId,
  })
  if (error) return { error: error.message }
  revalidatePath("/sub-teams")
  return { success: true }
}

export async function assignTask(taskId: string, userId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("tasks")
    .update({ assigned_user_id: userId })
    .eq("id", taskId)
  if (error) return { error: error.message }
  revalidatePath("/sub-teams")
  return { success: true }
}

export async function updateTaskStatus(taskId: string, status: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", taskId)
  if (error) return { error: error.message }
  revalidatePath("/sub-teams")
  return { success: true }
}

export async function addTaskComment(taskId: string, body: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("comments").insert({
    entity_type: "task",
    entity_id: taskId,
    body,
  })
  if (error) return { error: error.message }
  revalidatePath("/sub-teams")
  return { success: true }
}

export async function submitTaskForApproval(
  taskId: string,
  approverId: string,
  submittedLink?: string
) {
  const supabase = await createClient()
  const { error } = await supabase.from("approvals").insert({
    task_id: taskId,
    approver_id: approverId,
    submitted_link: submittedLink,
    status: "pending",
  })
  if (error) return { error: error.message }

  await supabase
    .from("tasks")
    .update({ status: "awaiting_review" })
    .eq("id", taskId)

  revalidatePath("/sub-teams")
  return { success: true }
}
