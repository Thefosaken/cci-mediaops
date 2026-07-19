import { PRIORITIES, REQUEST_STATUSES } from "@/constants"
import type { FieldDef, FieldOption, FieldValue } from "@/lib/views/types"

import type { RequestRow, SubTeamLite } from "./request-row-types"

const STATUS_ORDER = REQUEST_STATUSES.map((s) => s.value) as string[]
const STATUS_LABELS = new Map<string, string>(REQUEST_STATUSES.map((s) => [s.value, s.label]))
const PRIORITY_ORDER = PRIORITIES.map((p) => p.value) as string[]
const PRIORITY_LABELS = new Map<string, string>(PRIORITIES.map((p) => [p.value, p.label]))

/** Statuses where a passed deadline is no longer a problem. */
const SETTLED_STATUSES = new Set(["completed", "rejected", "cancelled"])

/**
 * A deadline is only "overdue" if it has passed *and* the request is still live.
 * A completed request with last month's deadline is history, not a fire.
 */
export function isOverdue(record: RequestRow): boolean {
  if (!record.deadline) return false
  if (SETTLED_STATUSES.has(record.status)) return false
  const due = new Date(record.deadline)
  if (Number.isNaN(due.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due.getTime() < today.getTime()
}

function requesterName(record: RequestRow): string | null {
  return record.requester?.full_name?.trim() || record.requester_name?.trim() || null
}

function requesterEmail(record: RequestRow): string | null {
  return record.requester?.email || record.requester_contact || null
}

function text(value: string | null | undefined): FieldValue {
  const trimmed = value?.trim()
  return trimmed ? { kind: "text", text: trimmed } : { kind: "empty" }
}

/** Distinct, sorted options discovered from the records themselves. */
function discover(records: RequestRow[], pick: (r: RequestRow) => string | null): FieldOption[] {
  const seen = new Set<string>()
  for (const record of records) {
    const value = pick(record)
    if (value) seen.add(value)
  }
  return [...seen].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }))
}

/**
 * The field catalogue for the requests record set.
 *
 * Sub-teams need the campus roster to turn stored ids into names, so the
 * catalogue is built rather than declared as a module constant.
 */
export function buildRequestFields(subTeams: SubTeamLite[]): FieldDef<RequestRow>[] {
  const subTeamLabels = new Map<string, string>(subTeams.map((t) => [t.id, t.name]))

  return [
    {
      id: "title",
      label: "Title",
      type: "text",
      icon: "Type",
      primary: true,
      value: (r) => ({ kind: "text", text: r.title }),
      sortValue: (r) => r.title.toLowerCase(),
      // Free text has as many groups as there are records — grouping is noise.
      groupable: false,
      sortable: true,
      filterable: false,
      width: "minmax(240px, 2.2fr)"
    },
    {
      id: "status",
      label: "Status",
      type: "status",
      icon: "CircleDot",
      value: (r) => ({ kind: "status", value: r.status }),
      groupKey: (r) => r.status || null,
      groupLabel: (key) => STATUS_LABELS.get(key) ?? key,
      // Sorted by pipeline position, not alphabetically — "Accepted" before
      // "Completed" is meaningful, A-before-C is not.
      sortValue: (r) => {
        const index = STATUS_ORDER.indexOf(r.status)
        return index === -1 ? STATUS_ORDER.length : index
      },
      options: REQUEST_STATUSES.map((s) => ({ value: s.value, label: s.label })),
      groupable: true,
      sortable: true,
      filterable: true,
      width: "168px"
    },
    {
      id: "priority",
      label: "Priority",
      type: "select",
      icon: "Flag",
      value: (r) =>
        r.priority
          ? { kind: "select", value: r.priority, label: PRIORITY_LABELS.get(r.priority) ?? r.priority }
          : { kind: "empty" },
      groupKey: (r) => r.priority || null,
      groupLabel: (key) => PRIORITY_LABELS.get(key) ?? key,
      sortValue: (r) => {
        const index = PRIORITY_ORDER.indexOf(r.priority)
        return index === -1 ? -1 : index
      },
      options: PRIORITIES.map((p) => ({ value: p.value, label: p.label })),
      groupable: true,
      sortable: true,
      filterable: true,
      width: "120px"
    },
    {
      id: "requester",
      label: "Requester",
      type: "person",
      icon: "User",
      value: (r) => {
        const name = requesterName(r)
        return name ? { kind: "person", name, email: requesterEmail(r) } : { kind: "empty" }
      },
      groupKey: (r) => requesterName(r),
      groupLabel: (key) => key,
      sortValue: (r) => requesterName(r)?.toLowerCase() ?? null,
      dynamicOptions: (records) => discover(records, requesterName),
      groupable: true,
      sortable: true,
      filterable: true,
      width: "190px"
    },
    {
      id: "requesting_unit",
      label: "Requesting unit",
      type: "select",
      icon: "Building2",
      value: (r) =>
        r.requesting_unit ? { kind: "select", value: r.requesting_unit, label: r.requesting_unit } : { kind: "empty" },
      groupKey: (r) => r.requesting_unit || null,
      groupLabel: (key) => key,
      sortValue: (r) => r.requesting_unit?.toLowerCase() ?? null,
      // Units are an open set — requesters can type their own — so options are
      // discovered from the data rather than pinned to the constant.
      dynamicOptions: (records) => discover(records, (r) => r.requesting_unit),
      groupable: true,
      sortable: true,
      filterable: true,
      width: "170px"
    },
    {
      id: "sub_teams",
      label: "Sub-teams",
      type: "multi",
      icon: "Users",
      value: (r) => {
        const items = r.request_sub_teams
          .map((join) => ({
            value: join.sub_team_id,
            label: join.sub_teams?.name ?? subTeamLabels.get(join.sub_team_id) ?? "Unknown team"
          }))
          .sort((a, b) => a.label.localeCompare(b.label))
        return items.length > 0 ? { kind: "multi", items } : { kind: "empty" }
      },
      // Multi-value: a request routed to Design and Sound appears in both columns.
      groupKey: (r) => r.request_sub_teams.map((join) => join.sub_team_id),
      groupLabel: (key) => subTeamLabels.get(key) ?? "Unknown team",
      options: subTeams.map((t) => ({ value: t.id, label: t.name })),
      groupable: true,
      // No single comparable value — sorting a set of teams is arbitrary.
      sortable: false,
      filterable: true,
      width: "220px"
    },
    {
      id: "deadline",
      label: "Deadline",
      type: "date",
      icon: "CalendarClock",
      value: (r) => (r.deadline ? { kind: "date", iso: r.deadline } : { kind: "empty" }),
      sortValue: (r) => {
        if (!r.deadline) return null
        const time = new Date(r.deadline).getTime()
        return Number.isNaN(time) ? null : time
      },
      // Grouping by an exact timestamp yields one group per record. Date
      // bucketing (this week / overdue) would need its own field.
      groupable: false,
      sortable: true,
      filterable: false,
      width: "130px"
    },
    {
      id: "event",
      label: "Event",
      type: "text",
      icon: "CalendarDays",
      value: (r) => text(r.events?.title),
      groupKey: (r) => r.events?.title?.trim() || null,
      groupLabel: (key) => key,
      sortValue: (r) => r.events?.title?.toLowerCase() ?? null,
      dynamicOptions: (records) => discover(records, (r) => r.events?.title?.trim() ?? null),
      groupable: true,
      sortable: true,
      filterable: true,
      width: "180px"
    },
    {
      id: "approval_required",
      label: "Approval required",
      type: "boolean",
      icon: "ShieldCheck",
      value: (r) => ({ kind: "boolean", value: r.approval_required === true }),
      groupKey: (r) => (r.approval_required === true ? "yes" : "no"),
      groupLabel: (key) => (key === "yes" ? "Approval required" : "No approval needed"),
      sortValue: (r) => (r.approval_required === true ? 1 : 0),
      options: [
        { value: "yes", label: "Required" },
        { value: "no", label: "Not required" }
      ],
      groupable: true,
      sortable: true,
      filterable: true,
      width: "150px"
    },
    {
      id: "created_at",
      label: "Created",
      type: "date",
      icon: "Clock",
      value: (r) => (r.created_at ? { kind: "date", iso: r.created_at } : { kind: "empty" }),
      sortValue: (r) => {
        const time = new Date(r.created_at).getTime()
        return Number.isNaN(time) ? null : time
      },
      groupable: false,
      sortable: true,
      filterable: false,
      width: "120px"
    }
  ]
}
