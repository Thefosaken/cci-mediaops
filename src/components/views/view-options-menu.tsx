"use client"

import * as React from "react"
import { ArrowUpDown, Columns3, EyeOff, ListFilter, Rows3, Table2, X } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import type { ViewLayout } from "@/lib/views/types"

import { PopoverLabel, PopoverRow, ViewPopover, focusRing } from "./view-popover"

export type ViewFacet = "filter" | "sort" | "hidden" | "group"

const HINT_KEY = "cci-mediaops:view-hint-dismissed"

interface ViewOptionsMenuProps {
  open: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
  layout: ViewLayout
  onSetLayout: (layout: ViewLayout) => void
  /** Promotes the facet to its own toolbar chip and opens that chip's menu. */
  onPickFacet: (facet: ViewFacet) => void
  counts: { filter: number; sort: number; hidden: number; group: number }
  align?: "start" | "end"
}

/**
 * The "Edit view" popover: the four facets as menu rows, then the layout tiles.
 *
 * Picking a facet here doesn't configure anything — it promotes that facet to a
 * chip in the toolbar, which is where the actual editing happens. That two-step
 * keeps the toolbar quiet by default while making every facet one click away.
 */
export function ViewOptionsMenu({
  open,
  onClose,
  triggerRef,
  layout,
  onSetLayout,
  onPickFacet,
  counts,
  align = "start"
}: ViewOptionsMenuProps) {
  const [hintDismissed, setHintDismissed] = React.useState(true)

  // Read from storage in an effect, not during render — the server has no
  // localStorage and a mismatch here would be a hydration error.
  React.useEffect(() => {
    try {
      setHintDismissed(window.localStorage.getItem(HINT_KEY) === "1")
    } catch {
      setHintDismissed(false)
    }
  }, [])

  function dismissHint() {
    setHintDismissed(true)
    try {
      window.localStorage.setItem(HINT_KEY, "1")
    } catch {
      // Storage unavailable — the hint simply returns next session.
    }
  }

  function pick(facet: ViewFacet) {
    onPickFacet(facet)
  }

  function badge(n: number) {
    return n > 0 ? <span className="tabular-nums">{n}</span> : undefined
  }

  return (
    <ViewPopover
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      label="Edit view"
      align={align}
      width={264}
      maxHeight={420}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-1">
          <PopoverRow icon={<ListFilter aria-hidden />} trailing={badge(counts.filter)} onClick={() => pick("filter")}>
            Filter
          </PopoverRow>
          <PopoverRow icon={<ArrowUpDown aria-hidden />} trailing={badge(counts.sort)} onClick={() => pick("sort")}>
            Sort
          </PopoverRow>
          <PopoverRow icon={<EyeOff aria-hidden />} trailing={badge(counts.hidden)} onClick={() => pick("hidden")}>
            Hide fields
          </PopoverRow>
          <PopoverRow icon={<Rows3 aria-hidden />} trailing={badge(counts.group)} onClick={() => pick("group")}>
            Group by
          </PopoverRow>
        </div>

        <div className="border-t border-border pb-2">
          <PopoverLabel>Layout</PopoverLabel>
          <div className="grid grid-cols-2 gap-2 px-2 pt-1">
            <LayoutTile
              active={layout === "table"}
              label="Table"
              onClick={() => onSetLayout("table")}
              icon={<Table2 className="h-5 w-5" aria-hidden />}
            />
            <LayoutTile
              active={layout === "board"}
              label="Board"
              onClick={() => onSetLayout("board")}
              icon={<Columns3 className="h-5 w-5" aria-hidden />}
            />
          </div>
        </div>

        {!hintDismissed && (
          <div className="flex items-start gap-2 border-t border-border bg-surface-subtle/60 px-3 py-2">
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted">
              Changes here are only visible to you until you save them.
            </p>
            <button
              type="button"
              aria-label="Dismiss hint"
              onClick={dismissHint}
              className={cn(
                "-mr-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded",
                "text-faint transition-colors duration-100 ease-out hover:text-foreground",
                focusRing
              )}
            >
              {/* 12px: a dismiss glyph on a 12px hint, not an icon in its own right. */}
              <X className="h-3 w-3" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </ViewPopover>
  )
}

function LayoutTile({
  active,
  label,
  icon,
  onClick
}: {
  active: boolean
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border py-3",
        "transition-[background,border-color,color,transform] duration-[120ms] ease-[var(--ease-out-quart)]",
        focusRing,
        "active:scale-[0.98]",
        active
          ? "border-primary bg-primary-soft text-primary"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground"
      )}
    >
      {icon}
      <span className="text-[12px] font-medium">{label}</span>
    </button>
  )
}
