"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { hasPermission, type PermissionCheck } from "@/lib/permissions"
import { eventSchema, eventSlotSchema, MAX_SLOTS_PER_EVENT } from "@/lib/validators"
import type { EventInput, EventSlotInput } from "@/lib/validators"
import { expandRecurrence, rebaseOntoDate, toIsoDate } from "@/lib/utils/rostering"
import type { UserRole } from "@/types"

/**
 * Events and the slots inside them.
 *
 * RLS is permissive by project convention (CLAUDE.md), so every mutation gates itself.
 * Admins and sub-team leads create and edit; only admins cancel or delete, because an
 * event usually has other teams rostered against it and removing it takes their work
 * with it.
 *
 * The four-slot ceiling is enforced in the database (migration 00022) and re-checked
 * here only so the caller gets a sentence rather than a constraint violation.
 */

type Guard =
  | { ok: true; role: UserRole; userId: string; campusId: string }
  | { ok: false; error: string }

async function requireEvent(action: PermissionCheck, refusal: string): Promise<Guard> {
  const profile = await getCurrentUserWithRole()
  if (!profile) return { ok: false, error: "Not signed in" }

  const memberships = profile.campus_memberships as
    | { campus_id: string; roles: { name: UserRole } | null }[]
    | undefined
  const first = memberships?.[0]
  const role = first?.roles?.name

  if (!role || !first) return { ok: false, error: "No role assigned" }
  if (!hasPermission(role, "events", action)) return { ok: false, error: refusal }

  return { ok: true, role, userId: profile.id, campusId: first.campus_id }
}

/* ── Create ─────────────────────────────────────────────────────────────── */

/**
 * Create an event, its services, and optionally the rest of the series.
 *
 * A recurring event materialises as real, independent rows sharing a
 * `recurrence_group_id` rather than a rule replayed at read time. Churches move one
 * week's service without moving the other fifty-one, and materialised rows make that
 * an ordinary edit instead of an exception table nobody remembers to check.
 *
 * Occurrences are rebased by wall-clock rather than by adding milliseconds, so an
 * 08:00 service is still 08:00 on the far side of a daylight-saving change.
 */
export async function createEvent(input: EventInput) {
  const parsed = eventSchema.safeParse(input)
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.flatten()), details: parsed.error.flatten() }
  }

  const guard = await requireEvent("create", "You do not have permission to create events")
  if (!guard.ok) return { error: guard.error }

  const data = parsed.data
  if ((data.slots?.length ?? 0) > MAX_SLOTS_PER_EVENT) {
    return { error: `An event can have at most ${MAX_SLOTS_PER_EVENT} services` }
  }

  const supabase = await createClient()

  const baseStart = new Date(data.startTime)
  const occurrences = data.recurrence
    ? expandRecurrence(baseStart, data.recurrence.frequency, data.recurrence.count)
    : [baseStart]

  // Only a real series carries a group id — a one-off with a null group reads as what
  // it is, and "is this part of a series" stays a single null check.
  const groupId = data.recurrence ? randomUUID() : null

  const dates = occurrences.map(toIsoDate)

  /**
   * Written in a fixed number of round trips rather than one per occurrence.
   *
   * A year of weekly services with teams on each is several hundred sequential
   * statements, which on a serverless function is a request that does not finish.
   * Worse than slow: it fails partway and leaves half a series behind, and somebody
   * is left deleting events by hand before they can try again.
   */
  const { data: existing } = await supabase
    .from("event_slots")
    .select("slot_date, slot_order")
    .eq("campus_id", guard.campusId)
    .in("slot_date", dates)

  // Positions already spoken for on each day, so a series landing on days that
  // already hold services takes what is left rather than colliding.
  const takenByDate = new Map<string, Set<number>>()
  for (const row of existing ?? []) {
    const set = takenByDate.get(row.slot_date) ?? new Set<number>()
    set.add(row.slot_order)
    takenByDate.set(row.slot_date, set)
  }

  const { data: eventRows, error: eventError } = await supabase
    .from("events")
    .insert(
      occurrences.map((occurrence) => {
        const shift = (iso: string) => rebaseOntoDate(new Date(iso), occurrence).toISOString()
        return {
          campus_id: guard.campusId,
          title: data.title,
          event_type: data.eventType,
          description: data.description ?? null,
          location: data.location ?? null,
          start_time: shift(data.startTime),
          end_time: data.endTime ? shift(data.endTime) : null,
          status: "planning",
          recurrence_group_id: groupId,
          created_by: guard.userId
        }
      })
    )
    .select("id, start_time")

  if (eventError) return { error: eventError.message }
  if (!eventRows?.length) return { error: "The event could not be created" }

  // Insert order is not a contract, so occurrences are re-paired by start time rather
  // than by position in the returned array.
  const created = [...eventRows]
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((e) => e.id)

  if (data.requiredSubTeams?.length) {
    const required = data.requiredSubTeams
    await supabase
      .from("event_sub_teams")
      .insert(created.flatMap((event_id) => required.map((sub_team_id) => ({ event_id, sub_team_id }))))
  }

  interface PendingSlot {
    event_id: string
    campus_id: string
    label: string
    slot_order: number
    slot_date: string
    start_time: string
    end_time: string | null
    notes: string | null
  }

  const pending: { row: PendingSlot; requirements: { subTeamId: string; neededCount: number }[] }[] = []
  let fullDays = 0

  occurrences.forEach((occurrence, i) => {
    const eventId = created[i]
    if (!eventId) return

    const slotDate = dates[i]
    const shift = (iso: string) => rebaseOntoDate(new Date(iso), occurrence).toISOString()
    const taken = takenByDate.get(slotDate) ?? new Set<number>()
    takenByDate.set(slotDate, taken)

    for (const slot of data.slots ?? []) {
      let position: number | null = null
      for (let p = 1; p <= MAX_SLOTS_PER_EVENT; p++) {
        if (!taken.has(p)) {
          position = p
          break
        }
      }

      // A day already holding four services is skipped rather than fatal — the rest of
      // the series is still worth having, and `fullDays` says how many fell short.
      if (position === null) {
        fullDays += 1
        break
      }

      taken.add(position)
      pending.push({
        row: {
          event_id: eventId,
          campus_id: guard.campusId,
          label: slot.label,
          slot_order: position,
          // Each occurrence's services land on that occurrence's day, keeping their times.
          slot_date: slotDate,
          start_time: shift(slot.startTime),
          end_time: slot.endTime ? shift(slot.endTime) : null,
          notes: slot.notes ?? null
        },
        requirements: slot.requirements ?? []
      })
    }
  })

  if (pending.length) {
    const { data: insertedSlots, error: slotError } = await supabase
      .from("event_slots")
      .insert(pending.map((p) => p.row))
      .select("id, event_id, slot_order")

    if (slotError) {
      return {
        error: `Created ${created.length} ${created.length === 1 ? "event" : "events"}, but the services failed: ${slotError.message}`
      }
    }

    // Re-paired by (event, position) — the only key unique across the whole batch.
    const idByKey = new Map((insertedSlots ?? []).map((s) => [`${s.event_id}:${s.slot_order}`, s.id]))
    const requirementRows = pending.flatMap((p) => {
      const slotId = idByKey.get(`${p.row.event_id}:${p.row.slot_order}`)
      if (!slotId) return []
      return p.requirements
        .filter((r) => r.neededCount > 0)
        .map((r) => ({ slot_id: slotId, sub_team_id: r.subTeamId, needed_count: r.neededCount }))
    })

    if (requirementRows.length) {
      const { error: reqError } = await supabase
        .from("event_slot_requirements")
        .insert(requirementRows)
      if (reqError) return { error: reqError.message }
    }
  }

  revalidatePath("/calendar")
  return {
    success: true,
    id: created[0],
    count: created.length,
    recurrenceGroupId: groupId,
    // Surfaced so a partial result is reported as one, rather than as a clean success.
    fullDays
  }
}

/**
 * The next free service position on a day.
 *
 * Positions are unique per campus per day, so an event being added to a day that
 * already has services takes the ones left rather than colliding on position 1. The
 * form's card order decides the order *within* one submit; where that block lands in
 * the day is the server's to decide, because only the server can see the other events.
 */
async function nextFreePosition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campusId: string,
  slotDate: string
): Promise<number | null> {
  const { data } = await supabase
    .from("event_slots")
    .select("slot_order")
    .eq("campus_id", campusId)
    .eq("slot_date", slotDate)

  const taken = new Set((data ?? []).map((r) => r.slot_order))
  for (let i = 1; i <= MAX_SLOTS_PER_EVENT; i++) if (!taken.has(i)) return i
  return null
}

/** Insert one slot and its team requirements. Shared by create and add-slot. */
async function insertSlot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    eventId: string
    campusId: string
    slot: EventSlotInput
    slotDate: string
    startTime: string
    endTime: string | null
  }
) {
  const position = await nextFreePosition(supabase, args.campusId, args.slotDate)
  if (position === null) {
    return {
      error: `That day already has ${MAX_SLOTS_PER_EVENT} services — the most a single day can hold`
    }
  }

  const { data: row, error } = await supabase
    .from("event_slots")
    .insert({
      event_id: args.eventId,
      campus_id: args.campusId,
      label: args.slot.label,
      slot_order: position,
      slot_date: args.slotDate,
      start_time: args.startTime,
      end_time: args.endTime,
      notes: args.slot.notes ?? null
    })
    .select("id")
    .single()

  if (error) {
    // 23505 is the day's position uniqueness and 23514 the 1..4 range check. Both are
    // a full day, which is the same news to the person clicking. Reachable despite the
    // check above when two people add a service to the same day at once.
    if (error.code === "23505" || error.code === "23514") {
      return {
        error: `That day already has ${MAX_SLOTS_PER_EVENT} services — the most a single day can hold`
      }
    }
    return { error: error.message }
  }

  if (args.slot.requirements?.length) {
    const { error: reqError } = await supabase.from("event_slot_requirements").insert(
      args.slot.requirements
        .filter((r) => r.neededCount > 0)
        .map((r) => ({ slot_id: row.id, sub_team_id: r.subTeamId, needed_count: r.neededCount }))
    )
    if (reqError) return { error: reqError.message }
  }

  return { id: row.id }
}

/* ── Edit ───────────────────────────────────────────────────────────────── */

export async function updateEvent(
  id: string,
  input: Partial<Pick<EventInput, "title" | "eventType" | "description" | "location" | "startTime" | "endTime">>
) {
  const guard = await requireEvent("edit", "You do not have permission to edit events")
  if (!guard.ok) return { error: guard.error }

  if (input.startTime && input.endTime && new Date(input.endTime) <= new Date(input.startTime)) {
    return { error: "The event ends before it starts" }
  }

  const supabase = await createClient()
  const { error, count } = await supabase
    .from("events")
    .update({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.eventType !== undefined && { event_type: input.eventType }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.location !== undefined && { location: input.location || null }),
      ...(input.startTime !== undefined && { start_time: input.startTime }),
      ...(input.endTime !== undefined && { end_time: input.endTime || null }),
      updated_at: new Date().toISOString()
    }, { count: "exact" })
    .eq("id", id)

  if (error) return { error: error.message }
  if (!count) return { error: "That event no longer exists" }

  revalidatePath("/calendar")
  return { success: true }
}

/**
 * Cancel a service.
 *
 * Gated on `delete` rather than `edit`: a lead may run their own event, but standing
 * down a Sunday takes every other team's roster with it, and that is an admin's call.
 * The row is kept — people rostered against a cancelled service still need to see why
 * their duty went away.
 */
export async function cancelEvent(id: string) {
  const guard = await requireEvent("delete", "Only an administrator can cancel an event")
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { error, count } = await supabase
    .from("events")
    .update({ status: "cancelled", updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)

  if (error) return { error: error.message }
  if (!count) return { error: "That event no longer exists" }

  revalidatePath("/calendar")
  return { success: true }
}

/**
 * Delete an event outright, with its slots and every duty rostered against them.
 *
 * Cancelling is nearly always the right action — this exists for events created in
 * error. The caller is told the blast radius first (see `describeEventImpact`).
 */
export async function deleteEvent(id: string) {
  const guard = await requireEvent("delete", "Only an administrator can delete an event")
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { error, count } = await supabase.from("events").delete({ count: "exact" }).eq("id", id)

  if (error) return { error: error.message }
  if (!count) return { error: "That event no longer exists" }

  revalidatePath("/calendar")
  return { success: true }
}

/** What deleting or cancelling this event would take with it. Read-only. */
export async function describeEventImpact(id: string) {
  const supabase = await createClient()

  const [{ count: slots }, { count: duties }, { count: sheets }] = await Promise.all([
    supabase.from("event_slots").select("id", { count: "exact", head: true }).eq("event_id", id),
    supabase.from("duty_assignments").select("id", { count: "exact", head: true }).eq("event_id", id),
    supabase.from("run_sheets").select("id", { count: "exact", head: true }).eq("event_id", id)
  ])

  return { slots: slots ?? 0, duties: duties ?? 0, runSheets: sheets ?? 0 }
}

/* ── Slots ──────────────────────────────────────────────────────────────── */

export async function addSlot(eventId: string, slot: EventSlotInput) {
  const parsed = eventSlotSchema.safeParse(slot)
  if (!parsed.success) return { error: firstIssue(parsed.error.flatten()) }

  const guard = await requireEvent("edit", "You do not have permission to edit events")
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const result = await insertSlot(supabase, {
    eventId,
    campusId: guard.campusId,
    slot: parsed.data,
    slotDate: parsed.data.slotDate,
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime ?? null
  })

  if (result.error) return { error: result.error }

  revalidatePath("/calendar")
  return { success: true, id: result.id }
}

/**
 * Edit a slot in place.
 *
 * Changing `slot_order` or `slot_date` re-points every duty on it — the
 * `trg_resync_duties_on_slot_change` trigger from 00022 does that, so a moved service
 * carries its people rather than leaving them guarding an empty position.
 */
export async function updateSlot(
  slotId: string,
  patch: { label?: string; slotOrder?: number; slotDate?: string; startTime?: string; endTime?: string | null; notes?: string | null }
) {
  const guard = await requireEvent("edit", "You do not have permission to edit events")
  if (!guard.ok) return { error: guard.error }

  if (patch.slotOrder !== undefined && (patch.slotOrder < 1 || patch.slotOrder > MAX_SLOTS_PER_EVENT)) {
    return { error: `Services are numbered 1 to ${MAX_SLOTS_PER_EVENT}` }
  }

  const supabase = await createClient()
  const { error, count } = await supabase
    .from("event_slots")
    .update({
      ...(patch.label !== undefined && { label: patch.label }),
      ...(patch.slotOrder !== undefined && { slot_order: patch.slotOrder }),
      ...(patch.slotDate !== undefined && { slot_date: patch.slotDate }),
      ...(patch.startTime !== undefined && { start_time: patch.startTime }),
      ...(patch.endTime !== undefined && { end_time: patch.endTime }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      updated_at: new Date().toISOString()
    }, { count: "exact" })
    .eq("id", slotId)

  if (error) {
    if (error.code === "23505") return { error: "Another service already holds that position" }
    // Moving a slot onto a date where one of its people is already booked trips the
    // clash constraint. That is the rule doing its job, not a fault.
    if (error.code === "23P01") {
      return { error: "Someone on this service is already rostered elsewhere on that day" }
    }
    return { error: error.message }
  }
  if (!count) return { error: "That service no longer exists" }

  revalidatePath("/calendar")
  return { success: true }
}

/** Remove a service. Duties rostered on it go too — the FK cascades. */
export async function deleteSlot(slotId: string) {
  const guard = await requireEvent("edit", "You do not have permission to edit events")
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { error, count } = await supabase
    .from("event_slots")
    .delete({ count: "exact" })
    .eq("id", slotId)

  if (error) return { error: error.message }
  if (!count) return { error: "That service no longer exists" }

  revalidatePath("/calendar")
  return { success: true }
}

/**
 * Set how many people each team needs for a slot.
 *
 * A team set to zero is removed rather than stored, so "not needed" and "needs none"
 * do not become two indistinguishable states in the coverage panel.
 */
export async function setSlotRequirements(
  slotId: string,
  requirements: { subTeamId: string; neededCount: number }[]
) {
  const guard = await requireEvent("edit", "You do not have permission to edit events")
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const wanted = requirements.filter((r) => r.neededCount > 0)

  const { error: clearError } = await supabase
    .from("event_slot_requirements")
    .delete()
    .eq("slot_id", slotId)
  if (clearError) return { error: clearError.message }

  if (wanted.length) {
    const { error } = await supabase.from("event_slot_requirements").insert(
      wanted.map((r) => ({ slot_id: slotId, sub_team_id: r.subTeamId, needed_count: r.neededCount }))
    )
    if (error) return { error: error.message }
  }

  revalidatePath("/calendar")
  return { success: true }
}

/* ── Run sheets from events ─────────────────────────────────────────────── */

/**
 * Start a run sheet for one service.
 *
 * The sheet is bound to the event and dated to the slot, so the calendar's "open run
 * sheet" link resolves without a date guess. Passing a template rebases it onto the
 * slot's day, which is the common path — most services run the same shape every week.
 *
 * Gated on `run_sheets.create`, not `events` — building the sheet is the sheet
 * permission, and assistant leads hold it while not being able to create events.
 */
export async function createRunSheetForSlot(slotId: string, options?: { templateId?: string; title?: string }) {
  const profile = await getCurrentUserWithRole()
  if (!profile) return { error: "Not signed in" }

  const memberships = profile.campus_memberships as
    | { campus_id: string; roles: { name: UserRole } | null }[]
    | undefined
  const first = memberships?.[0]
  const role = first?.roles?.name

  if (!role || !first) return { error: "No role assigned" }
  if (!hasPermission(role, "run_sheets", "create")) {
    return { error: "You do not have permission to create run sheets" }
  }

  const supabase = await createClient()

  const { data: slot } = await supabase
    .from("event_slots")
    .select("id, label, slot_date, event_id, events:event_id(title)")
    .eq("id", slotId)
    .maybeSingle()

  if (!slot) return { error: "That service no longer exists" }

  const eventTitle = (slot as unknown as { events?: { title?: string } }).events?.title ?? "Service"
  const title = options?.title?.trim() || `${eventTitle} — ${slot.label}`

  // One sheet per service, enforced by a partial unique index in 00022. Returning the
  // existing one makes the button idempotent — a second click opens the sheet rather
  // than reporting a conflict at somebody who only wanted to get to it.
  const { data: existing } = await supabase
    .from("run_sheets")
    .select("id")
    .eq("slot_id", slotId)
    .eq("is_template", false)
    .maybeSingle()

  if (existing) return { success: true, id: existing.id, existed: true }

  if (options?.templateId) {
    const { data: newId, error } = await supabase.rpc("duplicate_run_sheet", {
      p_source_id: options.templateId,
      p_title: title,
      p_as_template: false,
      p_target_date: slot.slot_date
    })
    if (error) return { error: error.message }

    const { error: linkError } = await supabase
      .from("run_sheets")
      .update({ event_id: slot.event_id, sheet_date: slot.slot_date, slot_id: slotId })
      .eq("id", newId as string)
    if (linkError) return { error: linkError.message }

    revalidatePath("/run-sheets")
    revalidatePath("/calendar")
    return { success: true, id: newId as string }
  }

  const { data, error } = await supabase
    .from("run_sheets")
    .insert({
      title,
      event_id: slot.event_id,
      slot_id: slotId,
      campus_id: first.campus_id,
      sheet_date: slot.slot_date,
      is_template: false,
      status: "draft",
      created_by: profile.id
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/run-sheets")
  revalidatePath("/calendar")
  return { success: true, id: data.id }
}

/* ── Reads ──────────────────────────────────────────────────────────────── */

export async function getEventDetails(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("events")
    .select(
      `*, run_sheets(id, title, sheet_date),
       event_sub_teams(sub_team_id),
       event_slots(*, event_slot_requirements(sub_team_id, needed_count))`
    )
    .eq("id", id)
    .single()

  if (error) return { error: error.message }
  return { data }
}

export async function duplicateEventTemplate(id: string) {
  const guard = await requireEvent("create", "You do not have permission to create events")
  if (!guard.ok) return { error: guard.error }

  const supabase = await createClient()
  const { data: original } = await supabase
    .from("events")
    .select("*, event_slots(*, event_slot_requirements(sub_team_id, needed_count))")
    .eq("id", id)
    .single()

  if (!original) return { error: "Event not found" }

  const { data: copy, error } = await supabase
    .from("events")
    .insert({
      campus_id: guard.campusId,
      title: `${original.title} (Copy)`,
      event_type: original.event_type,
      description: original.description,
      location: original.location,
      start_time: original.start_time,
      end_time: original.end_time,
      status: "draft",
      created_by: guard.userId
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  // Slots come with it — an event's shape is mostly its services, and a copy without
  // them is not a copy of anything useful.
  const slots = (original as unknown as {
    event_slots?: {
      label: string
      slot_order: number
      slot_date: string
      start_time: string
      end_time: string | null
      notes: string | null
      event_slot_requirements?: { sub_team_id: string; needed_count: number }[]
    }[]
  }).event_slots

  for (const slot of slots ?? []) {
    await insertSlot(supabase, {
      eventId: copy.id,
      campusId: guard.campusId,
      slot: {
        label: slot.label,
        slotOrder: slot.slot_order,
        slotDate: slot.slot_date,
        startTime: slot.start_time,
        endTime: slot.end_time ?? undefined,
        notes: slot.notes ?? undefined,
        requirements: (slot.event_slot_requirements ?? []).map((r) => ({
          subTeamId: r.sub_team_id,
          neededCount: r.needed_count
        }))
      },
      slotDate: slot.slot_date,
      startTime: slot.start_time,
      endTime: slot.end_time
    })
  }

  revalidatePath("/calendar")
  return { success: true, id: copy.id }
}

/** The first readable validation message, so a form error reaches the toast intact. */
function firstIssue(flat: { formErrors: string[]; fieldErrors: Record<string, string[] | undefined> }) {
  const field = Object.values(flat.fieldErrors).find((messages) => messages?.length)
  return field?.[0] ?? flat.formErrors[0] ?? "Invalid input"
}
