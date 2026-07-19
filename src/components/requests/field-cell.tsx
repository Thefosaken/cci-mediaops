import { format } from "date-fns"
import { CalendarDays, Check, ExternalLink, Minus } from "lucide-react"

import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils/cn"
import { UNGROUPED_KEY, type FieldDef, type FieldValue } from "@/lib/views/types"

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
    <>
      {/* `aria-label` on a plain span is ignored by most screen readers, so the
          dash is decorative and the word is what actually gets announced. */}
      <span className="select-none text-faint" aria-hidden="true">
        —
      </span>
      <span className="sr-only">Empty</span>
    </>
  )
}

/**
 * Glyphs inside table cells stay at 12px rather than §15's 16px dense size.
 * These sit inline against 13px text as punctuation on a value — at 16px they
 * outweigh the value itself and the column stops scanning as data.
 */
const cellGlyph = "h-3 w-3 shrink-0 opacity-70"

/**
 * Turns a group key back into the token that field type would render, so a
 * board column header and a table group header speak the same vocabulary as
 * the cells inside them.
 */
export function groupTokenValue<T>(
  field: FieldDef<T> | null | undefined,
  key: string,
  label: string
): FieldValue {
  if (key === UNGROUPED_KEY) return { kind: "empty" }
  if (!field) return { kind: "text", text: label }

  switch (field.type) {
    case "status":
      return { kind: "status", value: key }
    case "person":
      return { kind: "person", name: label }
    case "boolean":
      return { kind: "boolean", value: key === "yes" || key === "true" }
    case "select":
    case "multi":
      return { kind: "select", value: key, label }
    default:
      return { kind: "text", text: label }
  }
}

/**
 * Renders one normalised value as its typed token.
 *
 * The same tokens appear in table cells and board cards, so the vocabulary is
 * learned once: person = avatar chip, status = pill, date = glyph + numerals.
 *
 * ── Truncation rule ─────────────────────────────────────────────────────────
 *
 * Every value here is either an *atomic token* or *prose*, and the two get
 * opposite treatment:
 *
 *   Atomic tokens — `boolean`, `select`, `status`, `person`, `multi`, `date`,
 *   `number`. These are closed vocabularies read as whole words: "Urgent",
 *   "In progress", a name, a formatted date. Half of one carries no meaning —
 *   an "Ur…" pill is strictly worse than a clipped one, because it looks like
 *   a value rather than like missing room. So they are `shrink-0`, never
 *   ellipsised, and keep their intrinsic width. The column, not the token,
 *   is responsible for fitting them; the table scrolls horizontally, so
 *   there is nothing to gain by compressing.
 *
 *   Prose — `text` (titles, event names) and the `link` domain. Open-ended
 *   strings with no natural ceiling, where the first few words still carry
 *   the meaning. These truncate, and the full string lives in `title`.
 *
 * If a token genuinely does not fit, the answer is a wider column (see
 * `request-fields.tsx`), not a narrower token.
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

    // Prose: request titles and event names have no ceiling, and the opening
    // words are what identify the row. Truncates; `title` holds the rest.
    case "text":
      return (
        <span
          className={cn(base, density === "table" ? "truncate" : "line-clamp-2 items-start")}
          title={value.text}
        >
          {value.text}
        </span>
      )

    // Atomic: a thousands separator is not a place to break a number.
    case "number":
      return (
        <span className={cn(base, "tabular-nums whitespace-nowrap")} title={String(value.value)}>
          {value.value.toLocaleString()}
        </span>
      )

    // Atomic: two-state, and both states are one short word.
    case "boolean":
      return (
        <span className={base}>
          {value.value ? (
            <Badge variant="info" size="sm" className="shrink-0">
              <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> Yes
            </Badge>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] text-faint">
              <Minus className="h-3 w-3 shrink-0" aria-hidden="true" /> No
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
          className={cn(base, "gap-2 tabular-nums", tone === "danger" ? "text-danger" : "text-muted")}
          title={format(new Date(value.iso), "EEEE, d MMMM yyyy")}
        >
          <CalendarDays className={cellGlyph} aria-hidden="true" />
          {/* Atomic: "Mar 14" clipped to "Ma…" is not a shorter date, it is a
              wrong one. The format already self-shortens (§ `formatDate`). */}
          <span className="shrink-0 whitespace-nowrap">{label}</span>
        </span>
      )
    }

    case "person":
      return (
        <span
          className={cn(
            base,
            // 24px pill: a 20px avatar inset by 2px, 8px of air before the edge.
            "h-6 shrink-0 gap-2 rounded-full border border-border bg-surface-subtle pl-0.5 pr-2"
          )}
          title={value.email ? `${value.name} · ${value.email}` : value.name}
        >
          <Avatar name={value.name} email={value.email} size="xs" className="ring-0" />
          {/* Atomic: a name is a proper noun. "Emmanuel" cut to "Emma…" reads
              as a different person, and the avatar beside it already carries
              the disambiguation an abbreviation would destroy. */}
          <span className="whitespace-nowrap text-[12px] font-medium">{value.name}</span>
        </span>
      )

    case "select": {
      const severity = SEVERITY[value.value.toLowerCase()]
      return (
        <span className={base}>
          {/* Atomic. This is the case that produced a red dot followed by
              "Ur…" — a severity token you cannot read is a decoration. */}
          <Badge
            variant={severity ?? "muted"}
            size="sm"
            dot={Boolean(severity)}
            className="shrink-0"
            title={value.label}
          >
            {value.label}
          </Badge>
        </span>
      )
    }

    // Atomic. `StatusBadge` renders a plain `Badge`, which is already
    // `whitespace-nowrap`; `shrink-0` is what stops the flex parent squeezing it.
    case "status":
      return (
        <span className={base}>
          <StatusBadge status={value.value} size="sm" className="shrink-0" />
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
          {/* The pills live in their own shrinkable group, and `+N` is that
              group's sibling rather than its last child. Each pill is atomic
              (`shrink-0`, no inner truncate), so when the column is too narrow
              the group clips at its edge instead of ellipsising anything — and
              because `+N` sits outside the clipped box it can never be the
              thing that gets cut, which would hide the only signal that more
              values exist. At card density there is room for everything, so
              the group wraps and never clips. */}
          <span
            className={cn(
              "flex min-w-0 items-center gap-1",
              density === "card" ? "flex-wrap" : "overflow-hidden"
            )}
          >
            {shown.map((item) => (
              <Badge
                key={item.value}
                variant="muted"
                size="sm"
                className="shrink-0"
                title={item.label}
              >
                {item.label}
              </Badge>
            ))}
          </span>
          {overflow.length > 0 && (
            // A token, not loose text — otherwise "+2" floats off the baseline
            // of the badges it belongs to. Padding deliberately mirrors
            // `Badge size="sm"` so it sits at exactly their height.
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-sm bg-surface-subtle px-1.5 py-0.5",
                "text-[11px] font-medium tabular-nums text-muted"
              )}
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
            "gap-2 rounded-md text-[12px] text-muted transition-colors duration-[120ms] ease-out hover:text-foreground"
          )}
          title={`${value.label} — ${value.href}`}
        >
          <span className="truncate">{domain}</span>
          <ExternalLink className={cellGlyph} aria-hidden="true" />
        </a>
      )
    }
  }
}
