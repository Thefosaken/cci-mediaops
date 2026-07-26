export type UserRole = "super_admin" | "media_admin" | "sub_team_lead" | "assistant_lead" | "team_member" | "requester"

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

/** Sessions carry the same lifecycle as the segments they replace. */
export type SessionStatus = SegmentStatus

export type ConditionStatus = "good" | "fair" | "faulty" | "missing" | "under_repair"

export type AvailabilityStatus = "available" | "assigned" | "checked_out" | "checked_in" | "unavailable"

export type ApprovalStatus = "not_required" | "pending" | "approved" | "changes_requested" | "rejected"

export type IncidentSeverity = "low" | "medium" | "high" | "critical"

export type IncidentStatus = "open" | "investigating" | "resolved"

export type EntityType = "request" | "task" | "equipment" | "incident" | "event"

export interface Campus {
  id: string
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
  scope: "campus" | "sub_team"
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


export interface PublicRequestLink {
  id: string
  campus_id: string
  sub_team_ids: string[]
  created_by: string
  token: string
  label: string
  is_active: boolean
  submission_count: number
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface Request {
  id: string
  campus_id: string
  event_id: string | null
  title: string
  requesting_unit: string
  requester_id: string | null
  requester_name: string | null
  requester_contact: string | null
  public_request_link_id: string | null
  tracking_id: string | null
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
  /** Null for standalone sheets and templates — a run sheet no longer requires an event. */
  event_id: string | null
  campus_id: string
  title: string
  status: RunSheetStatus
  is_template: boolean
  /** The sheet or template this one was duplicated from, if any. */
  template_source_id: string | null
  /** Anchors the timeline columns when there is no event to inherit a date from. */
  sheet_date: string | null
  created_by: string
  created_at: string
  updated_at: string
}


/**
 * A session on a run sheet timeline.
 *
 * Times are half-open intervals [start_time, end_time): a session ending 08:30 and one
 * starting 08:30 do not overlap.
 *
 * start_time and end_time are nullable *as a pair*. Both set = placed on the timeline;
 * both null = parked in the "needs times" tray. A DB check constraint makes any other
 * combination impossible, so `session.start_time !== null` is enough to narrow both.
 */
export interface RunSheetSession {
  id: string
  run_sheet_id: string
  name: string
  start_time: string | null
  end_time: string | null
  session_type: string | null
  notes: string | null
  status: SessionStatus
  created_at: string
  updated_at: string
}

/** A session with confirmed times — the shape the timeline renderer works with. */
export type PlacedSession = RunSheetSession & {
  start_time: string
  end_time: string
}

export function isPlaced(session: RunSheetSession): session is PlacedSession {
  return session.start_time !== null && session.end_time !== null
}

export interface RunSheetSessionCue {
  id: string
  session_id: string
  sub_team_id: string
  cue_text: string | null
  created_at: string
  updated_at: string
}

export interface RunSheetSessionMember {
  id: string
  session_id: string
  /** Null when a role is rostered but nobody is assigned to it yet. */
  user_id: string | null
  sub_team_id: string | null
  role_title: string | null
  call_time: string | null
  confirmation_status: ConfirmationStatus
  attendance_status: AttendanceStatus | null
  notes: string | null
  created_at: string
  updated_at: string
}

/**
 * One service inside a day's event — "First Service", "Second Service".
 *
 * The rung between a day and a run sheet session. Capped at four per event by the
 * database (`slot_order between 1 and 4` plus a unique index), so the ceiling holds
 * even when two leads add a slot at the same moment.
 *
 * `slot_date` is stored rather than read off `start_time`: a timestamptz renders to a
 * different calendar day either side of midnight depending on the reader's timezone,
 * and which Sunday a roster belongs to must not move with the reader.
 */
export interface EventSlot {
  id: string
  event_id: string
  campus_id: string
  label: string
  /** 1–4. Display order, and the identity the clash rule is enforced against. */
  slot_order: number
  /** ISO date (no time). */
  slot_date: string
  start_time: string
  end_time: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** How many people a slot needs from one team — the denominator in "Camera 1 of 2". */
export interface EventSlotRequirement {
  id: string
  slot_id: string
  sub_team_id: string
  needed_count: number
  created_at: string
}

export type DutyStatus = "scheduled" | "confirmed" | "declined" | "swapped_out"

/**
 * Whether a duty is visible to the person it names.
 *
 * A month's roster is built over several sittings and is wrong for most of that time.
 * Draft duties are invisible to the assignee and send no notification; publishing
 * makes the whole batch real at once, so a person hears about their month in a single
 * message rather than one per Sunday.
 */
export type DutyPublishState = "draft" | "published"

/**
 * Someone rostered to a team for a day.
 *
 * Distinct from RunSheetSessionMember, which assigns a person to one item inside a
 * built run sheet. Duty is planned weeks ahead at day granularity, so it stands alone:
 * `event_id` links it to a service when one exists, but a duty can be created for a
 * date the calendar knows nothing else about yet.
 */
export interface DutyAssignment {
  id: string
  campus_id: string
  sub_team_id: string
  user_id: string
  /** ISO date (no time) — the day being rostered. */
  duty_date: string
  event_id: string | null
  /**
   * Which service. Null means the duty covers the whole day, which the clash rule
   * treats as occupying every slot — so an all-day duty blocks all four.
   */
  slot_id: string | null
  /** Mirrors the slot's `slot_order`; maintained by trigger, never written directly. */
  slot_no: number | null
  role_title: string | null
  call_time: string | null
  status: DutyStatus
  publish_state: DutyPublishState
  published_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Why a person cannot take a given slot. Resolved before the roster is written, so
 * the picker can render an unavailable day as inert rather than letting someone
 * choose it and meet a database error.
 */
export type ClashReason =
  | { kind: "same_slot"; teamName: string; roleTitle: string | null }
  | { kind: "all_day"; teamName: string }
  | { kind: "blocked_by_all_day"; teamName: string }

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
