"use client"

import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  MessageSquarePlus,
  MoreHorizontal,
  X
} from "lucide-react"

import { ActivityThread } from "@/components/shared/activity-thread"
import { Button, IconButton } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { FieldIcon } from "@/components/views/field-icon"
import { useToast } from "@/lib/toast/toast-context"
import { cn } from "@/lib/utils/cn"
import type { FieldDef, FieldType, FieldValue } from "@/lib/views/types"

import { AttachmentField } from "./attachment-field"
import { FieldCell, groupTokenValue } from "./field-cell"
import { isOverdue } from "./request-fields"
import type { RequestRow } from "./request-row-types"

export interface RequestDetailPanelProps {
  record: RequestRow
  /** The full field catalogue — the panel shows every field, including hidden ones. */
  fields: FieldDef<RequestRow>[]
  /** 1-based position of `record` within the filtered result set. */
  position: number
  total: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
  /** Rendered into the kebab menu — status changes etc. Supplied by the page. */
  menuItems?: React.ReactNode
  /**
   * Writes a new value for an editable field. Throwing reverts the optimistic
   * update. Absent = the panel is read-only.
   */
  onChangeField?: (recordId: string, fieldId: string, nextValue: string) => Promise<void>
  className?: string
}

/**
 * Fields the panel can write in place. Mirrors the board's DRAGGABLE_FIELD_IDS:
 * single-valued, fixed option set, and the two things triage actually changes.
 * Everything else needs an input type this surface does not offer.
 */
const EDITABLE_FIELD_IDS = new Set(["status", "priority"])

interface PendingEdits {
  /** The `record` object these overrides were made against. */
  source: RequestRow | null
  /** fieldId -> the value optimistically shown for it. */
  map: Record<string, string>
}

const EMPTY_PENDING: PendingEdits = { source: null, map: {} }

/**
 * What an unset field of each type invites you to add. Date is deliberately
 * absent: a lone calendar glyph already says "pick a day" without the noise of
 * a word beside it.
 */
const EMPTY_PROMPT: Partial<Record<FieldType, string>> = {
  text: "Text",
  person: "Person",
  select: "Option",
  status: "Status",
  multi: "Options",
  number: "Number",
  link: "Link",
  boolean: "Yes / no"
}

/** True while the user is typing — navigation keys must stay out of the way. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

/**
 * One quiet label voice for the whole panel — field gutter and prose headings
 * alike. 12px / weight 500 / `--text-muted`, sentence case.
 *
 * The old labels were 11px ALL CAPS with wide tracking, which made them louder
 * than the 13px values they were introducing (caps + tracking reads as emphasis
 * regardless of size) and violated §6.3, "avoid all caps in the app UI except
 * for short badges". They were also `--text-faint`, which on `--surface` is
 * 3.4:1 in light and 3.6:1 in dark — below the 4.5:1 AA floor for text this
 * small. `--text-muted` is 7.7:1 / 7.4:1 and still reads as clearly secondary
 * next to `--text-foreground` values, so the labels get quieter by size, weight
 * and case rather than by fading out of legibility.
 */
const LABEL_CLASS = "text-[12px] font-medium text-muted"

/**
 * The ghost state for an unset field: the field's own type icon plus the name
 * of what belongs there. It reads as an empty slot waiting to be filled, not as
 * a missing value — which is why it keeps the same height and baseline as a
 * real token instead of collapsing to nothing.
 *
 * Kept a step quieter than a real value (12px against 13px) so a stack of empty
 * fields never out-shouts the one field that is actually filled in.
 */
function EmptyField({ field }: { field: FieldDef<RequestRow> }) {
  const prompt = EMPTY_PROMPT[field.type]
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-sm border border-dashed border-border",
        "px-2 text-[12px] text-faint select-none",
        "transition-colors duration-[120ms] ease-out group-hover/field:border-border-strong group-hover/field:text-muted"
      )}
    >
      <FieldIcon name={field.icon} type={field.type} className="opacity-80" />
      {prompt && <span>{prompt}</span>}
    </span>
  )
}

/** The stored key behind a token, for the two option-backed kinds we can write. */
function valueKeyOf(value: FieldValue): string | null {
  if (value.kind === "status" || value.kind === "select") return value.value
  return null
}

/** Human name for a stored key, preferring the field's own option labels. */
function labelOf(field: FieldDef<RequestRow>, key: string): string {
  return field.options?.find((o) => o.value === key)?.label ?? field.groupLabel?.(key) ?? key
}

interface FieldRowProps {
  field: FieldDef<RequestRow>
  record: RequestRow
  /** Optimistic value awaiting (or already granted) the server's agreement. */
  override?: string
  /** Absent = this field is read-only and renders no trigger affordance. */
  onSelect?: (field: FieldDef<RequestRow>, nextValue: string) => void
}

/**
 * Label beside the value in a fixed gutter, not stacked above it.
 *
 * The stacked version cost ~58px per field (14px label + 6px gap + 24px token +
 * 20px separation), so ten fields burned ~580px of scroll on mostly air. Beside
 * it, a row is 24px tall on a 32px pitch — the same ten fields now cost ~320px,
 * a 45% cut, and the panel stops being a scroll of empty space.
 *
 * The gutter is fixed rather than auto so every value shares one hard left edge
 * you can scan straight down; the labels sit in a column the eye learns to skip.
 * 104px fits the longest label in the catalogue ("Requesting unit" ≈ 88px at
 * 12px/500) with room for one more, and still leaves ~244px for the value at the
 * panel's 400px floor — enough for every token `FieldCell` renders, including a
 * person chip, a truncated link domain, and two badges of a multi field before
 * it wraps. Wrapping is fine: `items-start` keeps the label pinned to the first
 * line of a value that runs long rather than drifting to its centre.
 */
function FieldRow({ field, record, override, onSelect }: FieldRowProps) {
  const stored = field.value(record)
  const value =
    override === undefined ? stored : groupTokenValue(field, override, labelOf(field, override))
  const danger = field.id === "deadline" && isOverdue(record)

  const token =
    value.kind === "empty" ? (
      <EmptyField field={field} />
    ) : (
      <FieldCell
        value={value}
        density="card"
        tone={danger ? "danger" : "default"}
        className="[overflow-wrap:anywhere] break-words"
      />
    )

  return (
    // 104px gutter = 26 × 4px; 12px gap = space-3.
    <div className="group/field grid grid-cols-[104px_minmax(0,1fr)] items-start gap-x-3">
      {/* leading-6 matches the 24px value row so label and token share a centre. */}
      <span className={cn(LABEL_CLASS, "leading-6")}>{field.label}</span>
      <div className="flex min-h-6 min-w-0 items-center leading-6">
        {onSelect ? (
          <EditableField field={field} value={value} onSelect={onSelect}>
            {token}
          </EditableField>
        ) : (
          token
        )}
      </div>
    </div>
  )
}

/**
 * The token, made clickable.
 *
 * At rest it is indistinguishable from a read-only value — the panel should not
 * look like a form. The affordance is spent only once the pointer is on it: a
 * quiet surface behind the token and a chevron fading in. The chevron's space is
 * reserved at all times so nothing shifts when it appears.
 */
function EditableField({
  field,
  value,
  onSelect,
  children
}: {
  field: FieldDef<RequestRow>
  value: FieldValue
  onSelect: (field: FieldDef<RequestRow>, nextValue: string) => void
  children: React.ReactNode
}) {
  const current = valueKeyOf(value)
  const currentLabel = current ? labelOf(field, current) : "not set"

  return (
    <DropdownMenu
      align="start"
      className="min-w-[200px]"
      trigger={
        <button
          type="button"
          aria-haspopup="menu"
          aria-label={`${field.label}: ${currentLabel}. Change ${field.label.toLowerCase()}`}
          className={cn(
            // The hover surface bleeds 8px/4px past the token on negative
            // margins, so it never changes the row's height or its left edge.
            // gap-2, not gap-1: at 4px the chevron sat against the pill's
            // rounded edge and read as part of the badge rather than as a
            // control beside it.
            "group/edit -mx-2 -my-1 inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-left",
            "transition-colors duration-[120ms] ease-out hover:bg-surface-subtle",
            "aria-[expanded=true]:bg-surface-subtle",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          )}
        >
          {children}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-3 w-3 shrink-0 text-faint opacity-0",
              "transition-opacity duration-[120ms] ease-out",
              "group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100",
              "group-aria-[expanded=true]/edit:opacity-100"
            )}
          />
        </button>
      }
    >
      {(field.options ?? []).map((option) => (
        <DropdownMenuItem
          key={option.value}
          onSelect={() => onSelect(field, option.value)}
          selected={option.value === current}
        >
          {option.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  )
}

/**
 * A free-text block that isn't part of the field catalogue (description etc.).
 *
 * These are the only real prose in the panel, so they get the `body` token from
 * §6.2 — 15px / 1.55 — rather than the 13px/`leading-relaxed` they used to share
 * with the field tokens. Two points of size is the cheapest way to say "this is
 * the thing to read"; the field stack above it stays at 13px and reads as data.
 * The label stays stacked here (not in the gutter) because a paragraph needs the
 * full ~360px measure, which is ~55 characters at 15px — a comfortable line.
 */
function ProseBlock({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <span className={cn(LABEL_CLASS, "mb-2 block leading-5")}>{label}</span>
      <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-foreground [overflow-wrap:anywhere]">
        {body}
      </p>
    </div>
  )
}

/**
 * The record detail panel for the requests screen.
 *
 * It is an inline panel, not an overlay: the page puts it in a flex row beside
 * the list and the list compresses to make room. The panel therefore owns only
 * its own column — full height of its container, its own scroll region, header
 * and footer pinned.
 *
 * The footer turns it into a record navigator. You can triage an entire filtered
 * queue with j/k without ever closing the panel, which is the whole point.
 */
export function RequestDetailPanel({
  record,
  fields,
  position,
  total,
  onPrev,
  onNext,
  onClose,
  menuItems,
  onChangeField,
  className
}: RequestDetailPanelProps) {
  const panelRef = React.useRef<HTMLElement>(null)
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const activityRef = React.useRef<HTMLDivElement>(null)

  const { success, error: toastError } = useToast()

  /**
   * Pending edits, tied to the exact `record` object they were made against —
   * the board's pattern. Fresh props are the truth: a re-fetched record (or the
   * next record in the queue) is a new object, so the overrides expire on their
   * own. No effect to sync, no window where a stale override paints over a value
   * the server just confirmed, and nothing to leak into the next record when the
   * footer arrows step forward.
   */
  const [pending, setPending] = React.useState<PendingEdits>(EMPTY_PENDING)
  const [announcement, setAnnouncement] = React.useState("")

  const overrides = pending.source === record ? pending.map : EMPTY_PENDING.map

  const hasPrev = position > 1
  const hasNext = position < total

  const commitChange = React.useCallback(
    async (field: FieldDef<RequestRow>, nextValue: string) => {
      if (!onChangeField) return

      const shownKey = valueKeyOf(field.value(record))
      const currentKey = pending.source === record ? pending.map[field.id] ?? shownKey : shownKey
      // Picking the value it already has is not a change worth a round trip.
      if (nextValue === currentKey) return

      const nextLabel = labelOf(field, nextValue)
      const previousLabel = currentKey ? labelOf(field, currentKey) : "not set"

      setPending((prev) => ({
        source: record,
        map: { ...(prev.source === record ? prev.map : {}), [field.id]: nextValue }
      }))
      setAnnouncement(`${field.label} changed to ${nextLabel}.`)

      try {
        // `onChangeField` owns re-fetching — it knows what it wrote.
        await onChangeField(record.id, field.id, nextValue)
        success(`${field.label} set to ${nextLabel}.`)
      } catch (err) {
        setPending((prev) => {
          if (prev.source !== record || !(field.id in prev.map)) return prev
          const next = { ...prev.map }
          delete next[field.id]
          return { source: record, map: next }
        })
        const message =
          err instanceof Error ? err.message : "Could not save the change. Please retry."
        setAnnouncement(`${field.label} could not be changed. It stayed ${previousLabel}.`)
        toastError(message)
      }
    },
    [onChangeField, record, pending, success, toastError]
  )

  const handleSelect = React.useCallback(
    (field: FieldDef<RequestRow>, nextValue: string) => {
      void commitChange(field, nextValue)
    },
    [commitChange]
  )

  /** A field is editable only if it is on the list, has options, and can be written. */
  function editable(field: FieldDef<RequestRow>): boolean {
    return Boolean(
      onChangeField && EDITABLE_FIELD_IDS.has(field.id) && field.options && field.options.length > 0
    )
  }

  // A new record is a swap, not a reload: the body re-enters from the top while
  // the header holds its place.
  React.useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [record.id])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // Typing a comment must never navigate records.
      if (isTyping(event.target)) return

      const panel = panelRef.current
      const target = event.target
      const inPanel = target instanceof Node && panel?.contains(target)
      const unfocused = target === document.body || target === document
      if (!inPanel && !unfocused) return

      switch (event.key) {
        case "Escape":
          event.preventDefault()
          onClose()
          break
        case "j":
        case "ArrowDown":
          if (!hasNext) return
          event.preventDefault()
          onNext()
          break
        case "k":
        case "ArrowUp":
          if (!hasPrev) return
          event.preventDefault()
          onPrev()
          break
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [hasNext, hasPrev, onNext, onPrev, onClose])

  /** Jump to the composer rather than opening a second surface to type in. */
  function focusComposer() {
    const section = activityRef.current
    if (!section) return
    section.scrollIntoView({ behavior: "smooth", block: "nearest" })
    section.querySelector("textarea")?.focus()
  }

  return (
    <aside
      ref={panelRef}
      aria-label="Request details"
      className={cn("flex h-full min-h-0 flex-col border-l border-border bg-surface", className)}
    >
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Header — fixed. Titles wrap over as many lines as they need; these are
          often raw URLs and truncating them destroys the only identifier. */}
      <header className="shrink-0 border-b border-border px-5 pb-4 pt-4">
        <div className="flex items-start gap-2">
          {/* §6.2 h3: 18px / 1.35 / 650. Was 19px, which is on no scale. */}
          <h2 className="min-w-0 flex-1 break-words text-[18px] font-semibold leading-[1.35] tracking-[-0.01em] text-foreground [overflow-wrap:anywhere]">
            {record.title}
          </h2>
          {/* -8px pulls the 44px target's optical centre up onto the title's
              first line without shrinking the target itself. */}
          <IconButton label="Close details" size="sm" onClick={onClose} className="-mr-2 -mt-2 h-11 w-11">
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        {/* Actions.
            "Add comment" was a full-width solid brand-red bar, which made
            commenting look like the most important thing on the screen and spent
            CCI red on a routine, non-committing action — §4.1 reserves red for
            primary actions and warns against overusing it. It is now a secondary
            control sized to its label, so the kebab reads as its equal rather
            than as something bolted onto the end of a bar. Red stays available
            for the destructive/commit items inside the kebab. */}
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={focusComposer}
            className="h-11 px-4"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            Add comment
          </Button>
          {menuItems && (
            <DropdownMenu
              align="end"
              className="min-w-[200px]"
              trigger={
                <IconButton label="Request actions" size="sm" variant="secondary" className="h-11 w-11">
                  <MoreHorizontal className="h-4 w-4" />
                </IconButton>
              }
            >
              {menuItems}
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Body — the only region that scrolls.
          Sections are separated by a hairline plus their own padding rather than
          by one uniform gap, so the panel reads as four ranked blocks — facts,
          then prose, then conversation — instead of a single undifferentiated
          column. The dense field grid gets 16px of vertical padding; the two
          reading sections get 20px, which is what makes them feel like a change
          of register and not just the next paragraph. */}
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div key={record.id} className="animate-fade-in [animation-duration:180ms]">
          <div className="space-y-2 px-5 py-4">
            {fields.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                record={record}
                override={overrides[field.id]}
                onSelect={editable(field) ? handleSelect : undefined}
              />
            ))}
          </div>

          {(record.description?.trim() || record.desired_output?.trim()) && (
            <div className="space-y-5 border-t border-border px-5 py-5">
              {record.description?.trim() && (
                <ProseBlock label="Description" body={record.description.trim()} />
              )}
              {record.desired_output?.trim() && (
                <ProseBlock label="Desired output" body={record.desired_output.trim()} />
              )}
            </div>
          )}

          {/*
            Between the prose and the conversation, because that is where it
            belongs in the reading order: what was asked for, what came with it,
            then what has been said about it since. `key` on the record id forces
            a fresh mount when the footer arrows step to another request — the
            field loads its own list and must not show the previous one while it
            re-fetches.
          */}
          <div className="border-t border-border px-5 py-5">
            <AttachmentField key={record.id} requestId={record.id} />
          </div>

          <div ref={activityRef} className="border-t border-border px-5 py-5">
            <ActivityThread entityType="request" entityId={record.id} />
          </div>
        </div>
      </div>

      {/* Footer — fixed. Position first, because the count is what tells you
          whether stepping is worth it. */}
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-5 py-2">
        <span className="text-[12px] tabular-nums text-muted" aria-live="polite">
          {position} of {total}
        </span>
        <div className="flex items-center gap-1">
          <IconButton
            label="Previous request"
            size="sm"
            variant="ghost"
            className="h-11 w-11"
            disabled={!hasPrev}
            onClick={onPrev}
          >
            <ArrowUp className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Next request"
            size="sm"
            variant="ghost"
            className="h-11 w-11"
            disabled={!hasNext}
            onClick={onNext}
          >
            <ArrowDown className="h-4 w-4" />
          </IconButton>
        </div>
      </footer>
    </aside>
  )
}
