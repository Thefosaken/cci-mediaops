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
    // `delete` covers cancelling a service, which a media admin has to be able to do
    // without escalating to a super admin — a cancelled Sunday is time-sensitive.
    events: ["view", "create", "edit", "delete"],
    schedules: ["view", "create", "edit", "approve"],
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
    // Leads run the services they staff — rehearsals, training nights, their own team's
    // programme — so they create and edit events. Cancelling one is deliberately not
    // theirs: an event usually has other teams rostered against it.
    events: ["view", "create", "edit"],
    // `approve` is the publish gate. A lead signs off their own team's rota.
    schedules: ["view", "create", "edit", "approve"],
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
    // just edit on someone else's roster. They stop short of `approve`: an assistant
    // drafts the month, the lead publishes it. That split is the point of drafts.
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

/**
 * Roles that work across every team rather than being anchored to their own.
 *
 * The distinction runs through the whole calendar: which teams a person may roster
 * into, whose drafts they may publish, whether the coverage panel shows the campus or
 * just their corner of it. Keeping it in one predicate stops those three answers
 * drifting apart.
 */
export function seesAllTeams(role: UserRole): boolean {
  return role === "super_admin" || role === "media_admin"
}

/**
 * The teams a person may roster into.
 *
 * An admin gets everything; a lead or assistant gets only the teams they belong to.
 * Assigning another lead's people is not a judgement they are placed to make, and a
 * list of the whole campus makes finding their own harder.
 */
export function assignableTeamIds(
  role: UserRole,
  myTeamIds: readonly string[],
  allTeamIds: readonly string[]
): string[] {
  if (!hasPermission(role, "schedules", "create")) return []
  return seesAllTeams(role) ? [...allTeamIds] : allTeamIds.filter((id) => myTeamIds.includes(id))
}

/**
 * Whether this role may make a draft roster real.
 *
 * Split from `schedules.create` so an assistant lead can build a month without being
 * able to send it to everyone — the review step only means something if the person
 * drafting and the person publishing can be different people.
 */
export function canPublishRoster(role: UserRole): boolean {
  return hasPermission(role, "schedules", "approve")
}
