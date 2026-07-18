export const DEFAULT_SUB_TEAMS = [
  "Projection",
  "Videography",
  "Photography",
  "Design",
  "Lighting",
  "Sound",
  "Social Media",
] as const

export const EVENT_TYPES = [
  { value: "sunday_service", label: "Sunday Service" },
  { value: "midweek_service", label: "Midweek Service" },
  { value: "worship_night", label: "Worship Night" },
  { value: "conference", label: "Conference" },
  { value: "training", label: "Training" },
  { value: "rehearsal", label: "Rehearsal" },
  { value: "outreach", label: "Outreach" },
  { value: "campus_event", label: "Campus Event" },
  { value: "department_event", label: "Department Event" },
  { value: "special_programme", label: "Special Programme" },
] as const

export const REQUEST_TYPES = [
  "Design Request",
  "Photography Request",
  "Videography Request",
  "Sound Request",
  "Lighting Request",
  "Projection Request",
  "Social Media Request",
  "Multi-Sub-Team Request",
  "Livestream Support",
  "Event Coverage",
  "Sermon Clip Request",
  "Announcement Slide Request",
  "Recap Video Request",
] as const

export const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const

export const REQUEST_STATUSES = [
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "clarification_needed", label: "Clarification Needed" },
  { value: "accepted", label: "Accepted" },
  { value: "in_progress", label: "In Progress" },
  { value: "awaiting_approval", label: "Awaiting Approval" },
  { value: "changes_requested", label: "Changes Requested" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
] as const

export const TASK_STATUSES = [
  { value: "to_do", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "awaiting_review", label: "Awaiting Review" },
  { value: "changes_requested", label: "Changes Requested" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const

export const EVENT_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "planning", label: "Planning" },
  { value: "confirmed", label: "Confirmed" },
  { value: "live", label: "Live" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const

export const CONFIRMATION_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Declined" },
  { value: "replacement_needed", label: "Replacement Needed" },
] as const

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  media_admin: "Media Admin",
  sub_team_lead: "Sub-Team Lead",
  assistant_lead: "Assistant Lead",
  team_member: "Team Member",
  requester: "Requester",
  approver: "Approver",
}

export const REQUESTING_UNITS = [
  "Videography",
  "Sound",
  "Social Media",
  "Projection",
  "Production",
  "Programs",
  "Photography",
  "Light",
  "Design",
  "Celeb Teens",
  "Celeb Kids",
  "Ambience",
  "Follow-up",
  "Comms",
  "CCW",
  "Protocol",
  "Pastor's Office",
] as const

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/calendar", label: "Calendar", icon: "Calendar" },
  { href: "/requests", label: "Requests", icon: "Inbox" },
  { href: "/scheduling", label: "Scheduling", icon: "CalendarCheck" },
  { href: "/run-sheets", label: "Run Sheets", icon: "ScrollText" },
  { href: "/sub-teams", label: "Sub-Teams", icon: "Users" },
  { href: "/equipment", label: "Equipment", icon: "Wrench" },
  { href: "/approvals", label: "Approvals", icon: "ClipboardCheck" },
  { href: "/incidents", label: "Incidents", icon: "AlertTriangle" },
  { href: "/reports", label: "Reports", icon: "BarChart3" },
  { href: "/settings", label: "Settings", icon: "Settings" },
] as const
