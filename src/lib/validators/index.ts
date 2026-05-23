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

export const scheduleSlotSchema = z.object({
  eventId: z.string().min(1, "Event is required"),
  subTeamId: z.string().min(1, "Sub-team is required"),
  roleTitle: z.string().min(1, "Role title is required"),
  assignedUserId: z.string().optional(),
  callTime: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().optional(),
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
  eventId: z.string().min(1, "Event is required"),
})

export const runSheetSegmentSchema = z.object({
  runSheetId: z.string().min(1, "Run sheet is required"),
  title: z.string().min(1, "Segment title is required"),
  segmentType: z.string().min(1, "Segment type is required"),
  sequenceOrder: z.number().int().min(0),
  plannedStartTime: z.string().optional(),
  estimatedDurationMinutes: z.number().int().positive().optional(),
  ownerName: z.string().optional(),
  projectionCue: z.string().optional(),
  soundCue: z.string().optional(),
  lightingCue: z.string().optional(),
  cameraCue: z.string().optional(),
  socialMediaCue: z.string().optional(),
  notes: z.string().optional(),
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

export type SignUpInput = z.infer<typeof signUpSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type EventInput = z.infer<typeof eventSchema>
export type RequestInput = z.infer<typeof requestSchema>
export type ScheduleSlotInput = z.infer<typeof scheduleSlotSchema>
export type TaskInput = z.infer<typeof taskSchema>
export type RunSheetInput = z.infer<typeof runSheetSchema>
export type RunSheetSegmentInput = z.infer<typeof runSheetSegmentSchema>
export type EquipmentInput = z.infer<typeof equipmentSchema>
export type ApprovalInput = z.infer<typeof approvalSchema>
export type IncidentInput = z.infer<typeof incidentSchema>
