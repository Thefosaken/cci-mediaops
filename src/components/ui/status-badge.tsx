import { Badge, type BadgeVariant } from "./badge"

type Status = string

/**
 * Maps operational status values from the schema to a consistent badge color.
 * Falls back to neutral.
 */
function variantForStatus(status: Status): BadgeVariant {
  const s = status.toLowerCase()
  // success-ish
  if (
    s === "active" || s === "confirmed" || s === "approved" || s === "completed" ||
    s === "ready" || s === "good" || s === "available" || s === "resolved" ||
    s === "checked_in" || s === "present" || s === "accepted" || s === "live"
  ) return "success"
  // pending-ish (warning)
  if (
    s === "pending" || s === "submitted" || s === "under_review" ||
    s === "clarification_needed" || s === "awaiting_approval" || s === "awaiting_review" ||
    s === "draft" || s === "planning" || s === "fair" || s === "investigating" ||
    s === "to_do" || s === "open" || s === "replacement_needed" || s === "checked_out"
  ) return "warning"
  // info-ish (in progress)
  if (
    s === "in_progress" || s === "assigned"
  ) return "info"
  // danger-ish
  if (
    s === "rejected" || s === "declined" || s === "blocked" || s === "cancelled" ||
    s === "missing" || s === "faulty" || s === "absent" || s === "under_repair" ||
    s === "inactive" || s === "suspended" || s === "changes_requested"
  ) return "danger"
  return "neutral"
}

const LABEL_OVERRIDES: Record<string, string> = {
  to_do: "To do",
  under_review: "Under review",
  clarification_needed: "Clarification",
  awaiting_approval: "Awaiting approval",
  awaiting_review: "Awaiting review",
  changes_requested: "Changes requested",
  replacement_needed: "Replacement needed",
  checked_out: "Checked out",
  checked_in: "Checked in",
  in_progress: "In progress",
  not_required: "Not required",
  under_repair: "Under repair",
}

function formatStatus(status: Status): string {
  if (LABEL_OVERRIDES[status]) return LABEL_OVERRIDES[status]
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

interface StatusBadgeProps {
  status: Status
  size?: "sm" | "default"
  withDot?: boolean
  className?: string
}

export function StatusBadge({ status, size = "default", withDot = true, className }: StatusBadgeProps) {
  return (
    <Badge variant={variantForStatus(status)} size={size} dot={withDot} className={className}>
      {formatStatus(status)}
    </Badge>
  )
}
