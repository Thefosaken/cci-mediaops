export type UserRole = "super_admin" | "media_admin" | "sub_team_lead" | "assistant_lead" | "team_member" | "requester" | "approver"

export type UserStatus = "pending" | "active" | "inactive" | "suspended"

export type CampusStatus = "active" | "inactive"

export type SubTeamStatus = "active" | "inactive"

export type EventStatus = "draft" | "planning" | "confirmed" | "live" | "completed" | "cancelled"

export type EventType =
  | "sunday_service"
  | "midweek_service"
  | "worship_night"
  | "conference"
  | "training"
  | "rehearsal"
  | "outreach"
  | "campus_event"
  | "department_event"
  | "special_programme"

export type ConfirmationStatus = "pending" | "confirmed" | "declined" | "replacement_needed"

export type AttendanceStatus = "present" | "absent" | "late" | "excused"

export type RequestStatus =
  | "submitted"
  | "under_review"
  | "clarification_needed"
  | "accepted"
  | "in_progress"
  | "awaiting_approval"
  | "changes_requested"
  | "completed"
  | "rejected"
  | "cancelled"

export type Priority = "low" | "normal" | "high" | "urgent"

export type TaskStatus =
  | "to_do"
  | "in_progress"
  | "blocked"
  | "awaiting_review"
  | "changes_requested"
  | "completed"
  | "cancelled"

export type RunSheetStatus = "draft" | "confirmed" | "live" | "completed"

export type SegmentStatus = "upcoming" | "active" | "completed" | "skipped"

export type ConditionStatus = "good" | "fair" | "faulty" | "missing" | "under_repair"

export type AvailabilityStatus = "available" | "assigned" | "checked_out" | "checked_in" | "unavailable"

export type ApprovalStatus = "not_required" | "pending" | "approved" | "changes_requested" | "rejected"

export type IncidentSeverity = "low" | "medium" | "high" | "critical"

export type IncidentStatus = "open" | "investigating" | "resolved"

export type EntityType = "request" | "task" | "equipment" | "incident" | "event"

export interface Organization {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface Campus {
  id: string
  organization_id: string
  name: string
  location: string | null
  status: CampusStatus
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  auth_user_id: string
  full_name: string
  email: string
  phone: string | null
  status: UserStatus
  created_at: string
  updated_at: string
}

export interface CampusMembership {
  id: string
  campus_id: string
  user_id: string
  role_id: string
  status: UserStatus
  created_at: string
  updated_at: string
}

export interface RoleEntity {
  id: string
  name: string
  description: string | null
  scope: "global" | "campus" | "sub_team"
  created_at: string
  updated_at: string
}

export interface Permission {
  id: string
  key: string
  description: string | null
}

export interface RolePermission {
  id: string
  role_id: string
  permission_id: string
}

export interface SubTeam {
  id: string
  campus_id: string
  name: string
  description: string | null
  status: SubTeamStatus
  created_at: string
  updated_at: string
}

export interface SubTeamMembership {
  id: string
  sub_team_id: string
  user_id: string
  role_id: string
  status: UserStatus
  created_at: string
  updated_at: string
}

export interface Event {
  id: string
  campus_id: string
  title: string
  event_type: EventType
  description: string | null
  location: string | null
  start_time: string
  end_time: string | null
  status: EventStatus
  created_by: string
  created_at: string
  updated_at: string
}

export interface EventSubTeam {
  id: string
  event_id: string
  sub_team_id: string
}

export interface ScheduleSlot {
  id: string
  event_id: string
  sub_team_id: string
  role_title: string
  assigned_user_id: string | null
  call_time: string | null
  start_time: string | null
  end_time: string | null
  confirmation_status: ConfirmationStatus
  attendance_status: AttendanceStatus | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Request {
  id: string
  campus_id: string
  event_id: string | null
  title: string
  requesting_unit: string
  requester_id: string
  description: string | null
  desired_output: string | null
  deadline: string | null
  priority: Priority
  status: RequestStatus
  approval_required: boolean
  approver_id: string | null
  created_at: string
  updated_at: string
}

export interface RequestSubTeam {
  id: string
  request_id: string
  sub_team_id: string
  status: RequestStatus
}

export interface Task {
  id: string
  campus_id: string
  event_id: string | null
  request_id: string | null
  sub_team_id: string
  title: string
  description: string | null
  assigned_user_id: string | null
  due_date: string | null
  priority: Priority
  status: TaskStatus
  created_by: string
  created_at: string
  updated_at: string
}

export interface RunSheet {
  id: string
  event_id: string
  title: string
  status: RunSheetStatus
  created_by: string
  created_at: string
  updated_at: string
}

export interface RunSheetSegment {
  id: string
  run_sheet_id: string
  sequence_order: number
  title: string
  segment_type: string
  planned_start_time: string | null
  estimated_duration_minutes: number | null
  owner_name: string | null
  projection_cue: string | null
  sound_cue: string | null
  lighting_cue: string | null
  camera_cue: string | null
  social_media_cue: string | null
  notes: string | null
  status: SegmentStatus
  created_at: string
  updated_at: string
}

export interface EquipmentItem {
  id: string
  campus_id: string
  sub_team_id: string
  name: string
  category: string | null
  asset_tag: string | null
  serial_number: string | null
  description: string | null
  condition_status: ConditionStatus
  availability_status: AvailabilityStatus
  storage_location: string | null
  current_custodian_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface EquipmentAssignment {
  id: string
  equipment_item_id: string
  event_id: string | null
  assigned_to_user_id: string | null
  status: AvailabilityStatus
  checkout_time: string | null
  checkin_time: string | null
  checkout_condition: string | null
  checkin_condition: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Approval {
  id: string
  request_id: string | null
  task_id: string | null
  submitted_by: string
  approver_id: string
  status: ApprovalStatus
  submitted_link: string | null
  feedback: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  entity_type: EntityType
  entity_id: string
  read_at: string | null
  created_at: string
}

export interface Incident {
  id: string
  campus_id: string
  event_id: string | null
  sub_team_id: string | null
  reported_by: string
  incident_type: string
  severity: IncidentSeverity
  description: string | null
  status: IncidentStatus
  resolution_notes: string | null
  created_at: string
  updated_at: string
}

export interface Comment {
  id: string
  entity_type: EntityType
  entity_id: string
  user_id: string
  body: string
  created_at: string
}

export interface AttachmentLink {
  id: string
  entity_type: EntityType
  entity_id: string
  title: string | null
  url: string
  file_type: string | null
  added_by: string
  created_at: string
}

export interface AuditLog {
  id: string
  actor_id: string
  action: string
  entity_type: string
  entity_id: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
}
