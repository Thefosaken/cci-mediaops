import { format } from "date-fns"
import { CalendarDays, Check, ExternalLink, Minus } from "lucide-react"

import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils/cn"
import type { FieldValue } from "@/lib/views/types"

type Density = "table" | "card"
type Tone = "default" | "danger"

interface FieldCellProps {
  value: FieldValue
  /** `table` keeps every value on one line; `card` is allowed to wrap. */
  density?: Density
  /** Lets the layout flag a value as a problem — e.g. a deadline that has passed. */
  tone?: Tone
  className?: string
}

/**
 * Select values that carry severity. Everything else stays neutral so the eye
 * only ever spends colour on things that earn it.
 */
const SEVERITY: Record<string, "danger" | "warning" | "muted"> = {
  urgent: "danger",
  high: "warning",
  critical: "danger",
  blocker: "danger"
}

/** Short, scannable date. The year only appears when it isn't the obvious one. */
function formatDate(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return format(date, date.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy")
}

function domainOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "")
  } catch {
    return href
  }
}

/** A blank cell reads as a bug. An em-dash reads as "nothing here yet". */
function Empty() {
  return (
    <span className="text-faint select-none" aria-label="Empty">
      —
    </span>
  )
}

/**
 * Renders one normalised value as its typed token.
 *
 * The same tokens appear in table cells and board cards, so the vocabulary is
 * learned once: person = avatar chip, status = pill, date = glyph + numerals.
 */
export function FieldCell({ value, density = "table", tone = "default", className }: FieldCellProps) {
  const base = cn("flex min-w-0 items-center text-[13px] text-foreground", className)

  switch (value.kind) {
    case "empty":
      return (
        <span className={base}>
          <Empty />
        </span>
      )

    case "text":
      return (
        <span
          className={cn(base, density === "table" ? "truncate" : "line-clamp-2 items-start")}
          title={value.text}
        >
          {value.text}
        </span>
      )

    case "number":
      return (
        <span className={cn(base, "tabular-nums")} title={String(value.value)}>
          {value.value.toLocaleString()}
        </span>
      )

    case "boolean":
      return (
        <span className={base}>
          {value.value ? (
            <Badge variant="info" size="sm">
              <Check className="h-2.5 w-2.5" aria-hidden="true" /> Yes
            </Badge>
          ) : (
            <span className="inline-flex items-center gap-1 text-[12.5px] text-faint">
              <Minus className="h-2.5 w-2.5" aria-hidden="true" /> No
            </span>
          )}
        </span>
      )

    case "date": {
      const label = formatDate(value.iso)
      if (!label) {
        return (
          <span className={base}>
            <Empty />
          </span>
        )
      }
      return (
        <span
          className={cn(base, "gap-1.5 tabular-nums", tone === "danger" ? "text-danger" : "text-muted")}
          title={format(new Date(value.iso), "EEEE, d MMMM yyyy")}
        >
          <CalendarDays className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
      )
    }

    case "person":
      return (
        <span
          className={cn(
            base,
            "gap-1.5 rounded-full border border-border bg-surface-subtle py-0.5 pl-0.5 pr-2 max-w-full"
          )}
          title={value.email ? `${value.name} · ${value.email}` : value.name}
        >
          <Avatar name={value.name} email={value.email} size="xs" className="ring-0" />
          <span className="truncate text-[12.5px] font-medium">{value.name}</span>
        </span>
      )

    case "select": {
      const severity = SEVERITY[value.value.toLowerCase()]
      return (
        <span className={base}>
          <Badge
            variant={severity ?? "muted"}
            size="sm"
            dot={Boolean(severity)}
            className="max-w-full"
            title={value.label}
          >
            <span className="truncate">{value.label}</span>
          </Badge>
        </span>
      )
    }

    case "status":
      return (
        <span className={base}>
          <StatusBadge status={value.value} size="sm" />
        </span>
      )

    case "multi": {
      // At table density two pills is the honest limit before the row starts to
      // shove other columns around; cards have the room to show everything.
      const limit = density === "table" ? 2 : value.items.length
      const shown = value.items.slice(0, limit)
      const overflow = value.items.slice(limit)
      return (
        <span className={cn(base, "gap-1", density === "card" && "flex-wrap")}>
          {shown.map((item) => (
            <Badge key={item.value} variant="muted" size="sm" className="max-w-[120px]" title={item.label}>
              <span className="truncate">{item.label}</span>
            </Badge>
          ))}
          {overflow.length > 0 && (
            <span
              className="shrink-0 text-[11px] font-medium text-faint tabular-nums"
              title={overflow.map((item) => item.label).join(", ")}
            >
              +{overflow.length}
            </span>
          )}
        </span>
      )
    }

    case "link": {
      const domain = domainOf(value.href)
      return (
        <a
          href={value.href}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            base,
            "gap-1.5 rounded-md text-[12.5px] text-muted transition-colors duration-[120ms] ease-out hover:text-foreground"
          )}
          title={`${value.label} — ${value.href}`}
        >
          <span className="truncate">{domain}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
        </a>
      )
    }
  }
}
