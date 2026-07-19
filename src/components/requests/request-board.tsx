"use client"

import { useCallback, useMemo, useState } from "react"

import { Columns3, GripVertical, Inbox, Info, MoveRight } from "lucide-react"

import { DropdownMenu, DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/lib/toast/toast-context"
import { cn } from "@/lib/utils/cn"
import { UNGROUPED_KEY, type FieldDef, type ViewGroup } from "@/lib/views/types"

import { FieldCell, groupTokenValue } from "./field-cell"
import { isOverdue } from "./request-fields"
import type { RequestRow } from "./request-row-types"

interface RequestBoardProps {
  /** Null when the view has no group-by — the board is meaningless without one. */
  groups: ViewGroup<RequestRow>[] | null
  fields: FieldDef<RequestRow>[]
  onOpen: (id: string) => void
  /** The field `groups` were produced from — powers the column header token. */
  groupField?: FieldDef<RequestRow> | null
  /**
   * Writes a record's new value for the grouped field. Rejecting (throwing)
   * reverts the optimistic move. Absent = read-only board.
   */
  onMove?: (recordId: string, fieldId: string, nextValue: string) => Promise<void>
  loading?: boolean
  /**
   * Column bodies scroll internally so the page body never scrolls sideways.
   * `"100%"` fills the flex parent.
   */
  maxHeight?: string
  className?: string
}

/* ---------------------------------------------------------------------------
 * Spacing constants, all on the 4px scale (§7). The hierarchy is deliberate:
 * columns sit further apart (16) than cards do (8), and a card's own padding
 * (12) sits between the two, so the eye groups cards into columns before it
 * groups columns into a board.
 * ------------------------------------------------------------------------- */

/** Column width. Wide enough for a two-line title plus three tokens. */
const COLUMN_W = 300
/** Column header height — matched to the table's 40px header, plus its border. */
const COLUMN_HEADER_H = 44
/**
 * Drop placeholder height, measured against a real card: 12px padding twice,
 * an 18px title line, an 8px gap and an ~18px token row.
 */
const DROP_PLACEHOLDER_H = 68

/**
 * Fields that map to exactly one writable column, so "which column did you drop
 * it in" has one unambiguous answer. `sub_teams` is a join table — a drag would
 * have to guess between adding, replacing, and moving. The rest aren't triage.
 */
const DRAGGABLE_FIELD_IDS = new Set(["status", "priority"])

/**
 * Which fields earn a slot on the card, best first — derived from the table's
 * MOBILE_PRIORITY but led by the person, since on a board the column already
 * answers "what state", leaving "who" and "by when" as the open questions.
 */
const CARD_PRIORITY = [
  "requester",
  "deadline",
  "status",
  "priority",
  "sub_teams",
  "requesting_unit",
  "event",
  "approval_required",
  "created_at"
]

/** Three tokens is the point where a card still reads in one glance. */
const MAX_CARD_TOKENS = 3

/** Stagger reads as "the column filling in", not as a cascade to sit through. */
const STAGGER_MS = 30
const MAX_STAGGERED = 8

interface PendingMoves {
  /** The `groups` array these overrides were made against. */
  source: ViewGroup<RequestRow>[] | null
  /** recordId -> group key it was optimistically moved into. */
  map: Record<string, string>
}

const EMPTY_PENDING: PendingMoves = { source: null, map: {} }

export function RequestBoard({
  groups,
  fields,
  onOpen,
  groupField,
  onMove,
  loading,
  maxHeight = "calc(100dvh - 260px)",
  className
}: RequestBoardProps) {

  const { success, error: toastError } = useToast()

  /**
   * Pending moves, tied to the exact `groups` array they were made against.
   * Fresh props are the truth: when the parent hands down a new record set the
   * overrides expire on their own, with no effect to sync and no window where
   * a stale override could yank a card out of a column the server just agreed on.
   */
  const [pending, setPending] = useState<PendingMoves>(EMPTY_PENDING)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")

  const canMove = Boolean(onMove && groupField && DRAGGABLE_FIELD_IDS.has(groupField.id))

  const overrides = pending.source === groups ? pending.map : EMPTY_PENDING.map

  /** Groups with pending moves applied — moved cards land at the top of the target. */
  const displayGroups = useMemo(() => {
    if (!groups) return null
    if (Object.keys(overrides).length === 0) return groups

    const moved = new Map<string, RequestRow>()
    for (const group of groups) {
      for (const record of group.records) {
        const target = overrides[record.id]
        if (target && target !== group.key) moved.set(record.id, record)
      }
    }
    if (moved.size === 0) return groups

    return groups.map((group) => {
      const kept = group.records.filter((r) => !moved.has(r.id))
      const incoming = [...moved.values()].filter(
        (r) => overrides[r.id] === group.key && !kept.some((k) => k.id === r.id)
      )
      return incoming.length === 0 && kept.length === group.records.length
        ? group
        : { ...group, records: [...incoming, ...kept] }
    })
  }, [groups, overrides])

  const labelFor = useCallback(
    (key: string) => {
      if (key === UNGROUPED_KEY) return "Ungrouped"
      return groupField?.groupLabel?.(key) ?? groups?.find((g) => g.key === key)?.label ?? key
    },
    [groupField, groups]
  )

  /**
   * Targets offered to the keyboard path. The fixed option set is preferred over
   * the rendered columns so a state nobody is currently in is still reachable.
   */
  const moveTargets = useMemo(() => {
    if (!canMove || !groupField) return []
    if (groupField.options && groupField.options.length > 0) return groupField.options
    return (groups ?? [])
      .filter((g) => g.key !== UNGROUPED_KEY)
      .map((g) => ({ value: g.key, label: g.label }))
  }, [canMove, groupField, groups])

  const commitMove = useCallback(
    async (record: RequestRow, fromKey: string, toKey: string) => {
      if (!onMove || !groupField) return
      // There is no value to write for "Ungrouped", and a no-op move is noise.
      if (toKey === fromKey || toKey === UNGROUPED_KEY) return

      const target = labelFor(toKey)
      // Only override into a column that exists, otherwise the card would be
      // filtered out of its group with nowhere to land and appear to vanish.
      const columnExists = (groups ?? []).some((g) => g.key === toKey)
      if (columnExists) {
        setPending((prev) => ({
          source: groups,
          map: { ...(prev.source === groups ? prev.map : {}), [record.id]: toKey }
        }))
      }
      setAnnouncement(`${record.title} moved to ${target}.`)

      try {
        // `onMove` owns re-fetching — it knows what it wrote. Refreshing here
        // too would just fire a second render pass for the same change.
        await onMove(record.id, groupField.id, toKey)
        success(`Moved to ${target}.`)
      } catch (err) {
        setPending((prev) => {
          if (prev.source !== groups || !(record.id in prev.map)) return prev
          const next = { ...prev.map }
          delete next[record.id]
          return { source: groups, map: next }
        })
        const message = err instanceof Error ? err.message : "Could not move the request. Please retry."
        setAnnouncement(`${record.title} could not be moved. It stayed in ${labelFor(fromKey)}.`)
        toastError(message)
      }
    },
    [onMove, groupField, groups, labelFor, success, toastError]
  )

  const primary = fields.find((f) => f.primary) ?? fields[0]

  /** The grouped field is repeated by the column header — showing it again is noise. */
  const cardFields = useMemo(() => {
    const candidates = fields.filter((f) => !f.primary && f.id !== groupField?.id)
    return CARD_PRIORITY.map((id) => candidates.find((f) => f.id === id))
      .filter((f): f is FieldDef<RequestRow> => Boolean(f))
      .slice(0, MAX_CARD_TOKENS)
  }, [fields, groupField])

  if (loading) return <RequestBoardSkeleton />

  if (!displayGroups) {
    return (
      <EmptyState
        icon={<Columns3 />}
        title="Choose a field to group by"
        description="The board turns grouping into columns. Pick a field — status, sub-team, priority — and the columns appear."
      />
    )
  }

  if (displayGroups.length === 0 || !primary) {
    return (
      <EmptyState
        icon={<Inbox />}
        title="No requests match this view"
        description="Clear the search or loosen the filters to see more of the record set."
      />
    )
  }

  function droppable(key: string) {
    return canMove && key !== UNGROUPED_KEY
  }

  function handleDragOver(event: React.DragEvent, key: string) {
    if (!droppable(key)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDropTarget((prev) => (prev === key ? prev : key))
  }

  function handleDragLeave(event: React.DragEvent, key: string) {
    const next = event.relatedTarget as Node | null
    if (next && event.currentTarget.contains(next)) return
    setDropTarget((prev) => (prev === key ? null : prev))
  }

  function handleDrop(event: React.DragEvent, group: ViewGroup<RequestRow>) {
    if (!droppable(group.key)) return
    event.preventDefault()
    const id = draggingId ?? event.dataTransfer.getData("text/plain")
    setDraggingId(null)
    setDropTarget(null)
    if (!id) return

    const source = (displayGroups ?? []).find((g) => g.records.some((r) => r.id === id))
    const record = source?.records.find((r) => r.id === id)
    if (!record || !source || source.key === group.key) return
    void commitMove(record, source.key, group.key)
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {onMove && groupField && !canMove && (
        // `small` token, §6.2: 13px — this is helper text, not a badge.
        <p className="mb-3 flex shrink-0 items-center gap-1.5 text-[13px] text-faint">
          <Info className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
          Cards can only be moved when the board is grouped by status or priority.
        </p>
      )}

      {/* The horizontal scroller owns the height so a column's `maxHeight: 100%`
          has a definite box to resolve against. */}
      <div className="-mx-1 min-h-0 flex-1 overflow-x-auto px-1 pb-2">
        <div className="flex h-full items-start gap-4">
          {displayGroups.map((group) => {
            // Hovering the column a card came from is not a move — no affordance.
            const draggedIsHere = group.records.some((r) => r.id === draggingId)
            const isTarget = droppable(group.key) && dropTarget === group.key && !draggedIsHere

            return (
              <section
                key={group.key}
                onDragOver={(e) => handleDragOver(e, group.key)}
                onDragLeave={(e) => handleDragLeave(e, group.key)}
                onDrop={(e) => handleDrop(e, group)}
                className={cn(
                  "flex shrink-0 flex-col overflow-hidden rounded-xl border bg-surface-subtle/40",
                  "transition-colors duration-[180ms] ease-out",
                  isTarget
                    ? "border-focus-ring bg-focus-ring/[0.06] ring-1 ring-focus-ring"
                    : "border-border"
                )}
                style={{ maxHeight, width: COLUMN_W }}
                aria-label={group.key === UNGROUPED_KEY ? "Ungrouped" : group.label}
              >
                <header
                  className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3"
                  style={{ height: COLUMN_HEADER_H }}
                >
                  {group.key === UNGROUPED_KEY ? (
                    // `label` token, §6.2: 12px / 650.
                    <span className="text-[12px] font-semibold text-muted">Ungrouped</span>
                  ) : (
                    <FieldCell value={groupTokenValue(groupField, group.key, group.label)} density="card" />
                  )}
                  {/* `caption` token, §6.2: 11px / 600. */}
                  <span className="ml-auto text-[11px] font-semibold tabular-nums text-faint">
                    {group.records.length}
                  </span>
                </header>

                <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-2">
                  {isTarget && (
                    <div
                      aria-hidden="true"
                      className="shrink-0 rounded-lg border border-dashed border-focus-ring/60 bg-focus-ring/[0.07]"
                      style={{ height: DROP_PLACEHOLDER_H }}
                    />
                  )}

                  {group.records.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[13px] text-faint">
                      Nothing here
                    </p>
                  ) : (
                    group.records.map((record, index) => (
                      <BoardCard
                        key={record.id}
                        record={record}
                        index={index}
                        primary={primary}
                        cardFields={cardFields}
                        groupKey={group.key}
                        canMove={canMove}
                        dragging={draggingId === record.id}
                        moveTargets={moveTargets}
                        groupFieldLabel={groupField?.label ?? "column"}
                        onOpen={onOpen}
                        onDragStart={() => setDraggingId(record.id)}
                        onDragEnd={() => {
                          setDraggingId(null)
                          setDropTarget(null)
                        }}
                        onMoveTo={(toKey) => void commitMove(record, group.key, toKey)}
                      />
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface BoardCardProps {
  record: RequestRow
  index: number
  primary: FieldDef<RequestRow>
  cardFields: FieldDef<RequestRow>[]
  groupKey: string
  canMove: boolean
  dragging: boolean
  moveTargets: { value: string; label: string }[]
  groupFieldLabel: string
  onOpen: (id: string) => void
  onDragStart: () => void
  onDragEnd: () => void
  onMoveTo: (toKey: string) => void
}

/**
 * One request, curated: the title, then at most three tokens. No field labels —
 * the token shapes (avatar chip, date glyph, pill) already say what they are.
 */
function BoardCard({
  record,
  index,
  primary,
  cardFields,
  groupKey,
  canMove,
  dragging,
  moveTargets,
  groupFieldLabel,
  onOpen,
  onDragStart,
  onDragEnd,
  onMoveTo
}: BoardCardProps) {
  const targets = moveTargets.filter((t) => t.value !== groupKey)

  return (
    <article
      draggable={canMove}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", record.id)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(record.id)}
      className={cn(
        "group animate-slide-up rounded-lg border border-border bg-surface p-3",
        "transition-[transform,box-shadow,border-color,opacity] duration-[150ms] ease-out",
        "hover:-translate-y-px hover:border-border-strong hover:shadow-md",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus-ring",
        canMove ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging && "scale-[0.98] opacity-40 shadow-none hover:translate-y-0",
        "motion-reduce:animate-none"
      )}
      style={{ animationDelay: `${Math.min(index, MAX_STAGGERED) * STAGGER_MS}ms` }}
    >
      <div className="flex items-start gap-1.5">
        {canMove && (
          <GripVertical
            className={cn(
              "mt-[3px] h-3.5 w-3.5 shrink-0 text-faint opacity-0",
              "transition-opacity duration-[120ms] ease-out",
              "group-hover:opacity-100 group-focus-within:opacity-100"
            )}
            aria-hidden="true"
          />
        )}

        {/*
          A real button carries the keyboard path to open. It has no handler of
          its own — the click it fires bubbles to the card, so mouse and keyboard
          run the exact same code.
        */}
        <button
          type="button"
          className="min-w-0 flex-1 text-left outline-none"
          aria-label={record.title}
        >
          <FieldCell
            value={primary.value(record)}
            density="card"
            className="font-medium leading-snug"
          />
        </button>

        {canMove && targets.length > 0 && (
          <DropdownMenu
            align="end"
            trigger={
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Move ${record.title} to another ${groupFieldLabel.toLowerCase()}`}
                className={cn(
                  "-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                  "text-faint opacity-0 transition-[opacity,color,background-color] duration-[120ms] ease-out",
                  "hover:bg-surface-subtle hover:text-foreground",
                  "group-hover:opacity-100 group-focus-within:opacity-100",
                  "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                )}
              >
                <MoveRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            }
          >
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {targets.map((target) => (
              <DropdownMenuItem key={target.value} onSelect={() => onMoveTo(target.value)}>
                {target.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenu>
        )}
      </div>

      {cardFields.length > 0 && (
        <div
          className={cn(
            "mt-2 flex flex-wrap items-center gap-2",
            // 20px = the grip's 14px plus the 6px gap beside it, so the tokens
            // line up under the title rather than under the grip.
            canMove && "pl-5"
          )}
        >
          {cardFields.map((field) => (
            <FieldCell
              key={field.id}
              value={field.value(record)}
              density="card"
              tone={field.id === "deadline" && isOverdue(record) ? "danger" : "default"}
            />
          ))}
        </div>
      )}
    </article>
  )
}

/** Board loading state — three columns of quiet cards. */
export function RequestBoardSkeleton({ columns = 3, cards = 3 }: { columns?: number; cards?: number }) {
  return (
    <div className="overflow-x-auto pb-2" aria-busy="true">
      <span className="sr-only">Loading requests…</span>
      <div className="flex items-start gap-4">
        {Array.from({ length: columns }).map((_, col) => (
          <div
            key={col}
            className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-subtle/40"
            style={{ width: COLUMN_W }}
          >
            <div
              className="flex items-center gap-2 border-b border-border bg-surface px-3"
              style={{ height: COLUMN_HEADER_H }}
            >
              <Skeleton height={12} width={96} />
              <Skeleton height={10} width={18} className="ml-auto" />
            </div>
            <div className="flex flex-col gap-2 p-2">
              {Array.from({ length: cards }).map((_, card) => (
                <div key={card} className="space-y-2 rounded-lg border border-border bg-surface p-3">
                  <Skeleton height={12} width="80%" />
                  <Skeleton height={10} width="55%" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
