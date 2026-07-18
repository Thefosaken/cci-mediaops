import type { UserRole } from "@/types"

export type PermissionCheck = "view" | "create" | "edit" | "delete" | "approve"

const PERMISSION_MATRIX: Record<UserRole, Record<string, PermissionCheck[]>> = {
  super_admin: {
    system: ["view", "create", "edit", "delete", "approve"],
    campus: ["view", "create", "edit", "delete", "approve"],
    sub_teams: ["view", "create", "edit", "delete", "approve"],
    events: ["view", "create", "edit", "delete", "approve"],
    schedules: ["view", "create", "edit", "delete", "approve"],
    requests: ["view", "create", "edit", "delete", "approve"],
    tasks: ["view", "create", "edit", "delete", "approve"],
    equipment: ["view", "create", "edit", "delete", "approve"],
    approvals: ["view", "create", "edit", "delete", "approve"],
    incidents: ["view", "create", "edit", "delete", "approve"],
    reports: ["view", "create", "edit", "delete", "approve"],
    run_sheets: ["view", "create", "edit", "delete", "approve"],
  },
  media_admin: {
    system: ["view"],
    campus: ["view", "edit"],
    sub_teams: ["view", "edit"],
    events: ["view", "create", "edit"],
    schedules: ["view", "create", "edit"],
    requests: ["view", "create", "edit"],
    tasks: ["view", "create", "edit"],
    equipment: ["view", "create", "edit"],
    approvals: ["view", "create", "edit", "approve"],
    incidents: ["view", "create", "edit"],
    reports: ["view", "create", "edit"],
    run_sheets: ["view", "create", "edit"],
  },
  sub_team_lead: {
    system: [],
    campus: [],
    sub_teams: ["view", "edit"],
    events: ["view"],
    schedules: ["view", "create", "edit"],
    requests: ["view", "edit"],
    tasks: ["view", "create", "edit"],
    equipment: ["view", "create", "edit"],
    approvals: ["view", "create", "edit", "approve"],
    incidents: ["view", "create", "edit"],
    reports: ["view", "create", "edit"],
    run_sheets: ["view", "create", "edit"],
  },
  assistant_lead: {
    system: [],
    campus: [],
    sub_teams: ["view"],
    events: ["view"],
    // Assistants build monthly schedules alongside leads, so they need create, not
    // just edit on someone else's roster.
    schedules: ["view", "create", "edit"],
    requests: ["view"],
    tasks: ["view", "create", "edit"],
    equipment: ["view", "create", "edit"],
    approvals: ["view"],
    incidents: ["view", "create"],
    reports: ["view"],
    run_sheets: ["view", "create", "edit"],
  },
  team_member: {
    system: [],
    campus: [],
    sub_teams: ["view"],
    events: ["view"],
    schedules: ["view"],
    requests: ["view"],
    tasks: ["view", "edit"],
    equipment: ["view"],
    approvals: [],
    incidents: ["create"],
    reports: ["view"],
    run_sheets: ["view"],
  },
  requester: {
    system: [],
    campus: [],
    sub_teams: [],
    events: ["view"],
    schedules: [],
    requests: ["view", "create"],
    tasks: [],
    equipment: [],
    approvals: [],
    incidents: [],
    reports: [],
    run_sheets: [],
  },
}

export function hasPermission(role: UserRole, resource: string, action: PermissionCheck): boolean {
  return PERMISSION_MATRIX[role]?.[resource]?.includes(action) ?? false
}

export function getPermissionsForRole(role: UserRole) {
  return PERMISSION_MATRIX[role] ?? {}
}
