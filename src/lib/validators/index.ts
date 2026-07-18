import { z } from "zod"

export const signUpSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
})

export const eventSchema = z.object({
  title: z.string().min(2, "Title is required"),
  eventType: z.string().min(1, "Event type is required"),
  description: z.string().optional(),
  location: z.string().optional(),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().optional(),
  requiredSubTeams: z.array(z.string()).optional(),
})

export const requestSchema = z.object({
  title: z.string().min(2, "Title is required"),
  requestingUnit: z.string().min(1, "Requesting unit is required"),
  eventId: z.string().optional(),
  subTeamIds: z.array(z.string()).min(1, "At least one sub-team is required"),
  description: z.string().optional(),
  desiredOutput: z.string().optional(),
  deadline: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  approvalRequired: z.boolean().default(false),
  approverId: z.string().optional(),
  attachmentLinks: z.array(z.object({ title: z.string().optional(), url: z.string().url() })).optional(),
})


export const taskSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  subTeamId: z.string().min(1, "Sub-team is required"),
  assignedUserId: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  requestId: z.string().optional(),
  eventId: z.string().optional(),
})

export const runSheetSchema = z.object({
  title: z.string().min(1, "Title is required"),
  // Optional now — run sheets can stand alone or exist as templates.
  eventId: z.string().optional(),
  sheetDate: z.string().optional(),
  isTemplate: z.boolean().default(false),
})

/**
 * A session on the timeline. Only name, start and end are required; cues and members
 * are optional.
 *
 * Times are half-open [start, end), so a session ending 08:30 does not collide with one
 * starting 08:30 — hence `end > start` rather than `end >= start`.
 */
export const runSheetSessionSchema = z
  .object({
    runSheetId: z.string().min(1, "Run sheet is required"),
    name: z.string().min(1, "Session name is required"),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
    sessionType: z.string().optional(),
    notes: z.string().optional(),
    cues: z
      .array(
        z.object({
          subTeamId: z.string().min(1),
          cueText: z.string().optional(),
        })
      )
      .optional(),
    memberIds: z.array(z.string()).optional(),
  })
  .refine((v) => new Date(v.endTime) > new Date(v.startTime), {
    message: "End time must be after start time",
    path: ["endTime"],
  })

/** A parked session — named, but with no times yet. */
export const parkedSessionSchema = z.object({
  runSheetId: z.string().min(1, "Run sheet is required"),
  name: z.string().min(1, "Session name is required"),
  sessionType: z.string().optional(),
  notes: z.string().optional(),
})

export const runSheetSessionMemberSchema = z.object({
  sessionId: z.string().min(1, "Session is required"),
  userId: z.string().optional(),
  subTeamId: z.string().optional(),
  roleTitle: z.string().optional(),
  callTime: z.string().optional(),
})


export const equipmentSchema = z.object({
  name: z.string().min(2, "Equipment name is required"),
  subTeamId: z.string().min(1, "Sub-team is required"),
  category: z.string().optional(),
  assetTag: z.string().optional(),
  serialNumber: z.string().optional(),
  description: z.string().optional(),
  conditionStatus: z.enum(["good", "fair", "faulty", "missing", "under_repair"]).default("good"),
  storageLocation: z.string().optional(),
})

export const approvalSchema = z.object({
  requestId: z.string().optional(),
  taskId: z.string().optional(),
  submittedLink: z.string().url("Valid URL is required").optional(),
  approverId: z.string().min(1, "Approver is required"),
})

export const incidentSchema = z.object({
  eventId: z.string().optional(),
  subTeamId: z.string().optional(),
  incidentType: z.string().min(1, "Incident type is required"),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  description: z.string().min(10, "Description is required"),
})

export const publicRequestSchema = z.object({
  title: z.string().min(2, "Title is required"),
  requestingUnit: z.string().min(1, "Requesting unit is required"),
  requesterName: z.string().min(1, "Your name is required"),
  requesterContact: z.string().min(1, "Email or phone is required"),
  subTeamIds: z.array(z.string()).min(1, "Please select at least one team"),
  description: z.string().optional(),
  desiredOutput: z.string().optional(),
  deadline: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
})

export type PublicRequestInput = z.infer<typeof publicRequestSchema>

export type SignUpInput = z.infer<typeof signUpSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type EventInput = z.infer<typeof eventSchema>
export type RequestInput = z.infer<typeof requestSchema>
export type TaskInput = z.infer<typeof taskSchema>
export type RunSheetInput = z.infer<typeof runSheetSchema>
export type RunSheetSessionInput = z.infer<typeof runSheetSessionSchema>
export type ParkedSessionInput = z.infer<typeof parkedSessionSchema>
export type RunSheetSessionMemberInput = z.infer<typeof runSheetSessionMemberSchema>
export type EquipmentInput = z.infer<typeof equipmentSchema>
export type ApprovalInput = z.infer<typeof approvalSchema>
export type IncidentInput = z.infer<typeof incidentSchema>
