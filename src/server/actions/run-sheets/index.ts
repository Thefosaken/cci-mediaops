"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function createRunSheet(eventId: string, title: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("run_sheets").insert({
    event_id: eventId,
    title,
  })
  if (error) return { error: error.message }
  revalidatePath("/run-sheets")
  return { success: true }
}

export async function addRunSheetSegment(data: {
  runSheetId: string
  title: string
  segmentType: string
  sequenceOrder: number
  projectionCue?: string
  soundCue?: string
  lightingCue?: string
  cameraCue?: string
  socialMediaCue?: string
  notes?: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.from("run_sheet_segments").insert({
    run_sheet_id: data.runSheetId,
    title: data.title,
    segment_type: data.segmentType,
    sequence_order: data.sequenceOrder,
    projection_cue: data.projectionCue,
    sound_cue: data.soundCue,
    lighting_cue: data.lightingCue,
    camera_cue: data.cameraCue,
    social_media_cue: data.socialMediaCue,
    notes: data.notes,
  })
  if (error) return { error: error.message }
  revalidatePath("/run-sheets")
  return { success: true }
}

export async function reorderRunSheetSegments(
  runSheetId: string,
  segmentOrder: { id: string; order: number }[]
) {
  const supabase = await createClient()
  for (const seg of segmentOrder) {
    await supabase
      .from("run_sheet_segments")
      .update({ sequence_order: seg.order })
      .eq("id", seg.id)
      .eq("run_sheet_id", runSheetId)
  }
  revalidatePath("/run-sheets")
  return { success: true }
}

export async function updateRunSheetCue(
  segmentId: string,
  cueType: string,
  cueValue: string
) {
  const supabase = await createClient()
  const updateField = `${cueType}_cue`
  const { error } = await supabase
    .from("run_sheet_segments")
    .update({ [updateField]: cueValue })
    .eq("id", segmentId)
  if (error) return { error: error.message }
  revalidatePath("/run-sheets")
  return { success: true }
}

export async function startLiveMode(runSheetId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("run_sheets")
    .update({ status: "live" })
    .eq("id", runSheetId)
  if (error) return { error: error.message }
  revalidatePath("/run-sheets")
  return { success: true }
}

export async function markSegmentComplete(segmentId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("run_sheet_segments")
    .update({ status: "completed" })
    .eq("id", segmentId)
  if (error) return { error: error.message }
  revalidatePath("/run-sheets")
  return { success: true }
}
