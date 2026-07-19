"use client"

import * as React from "react"
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  EyeOff,
  ListFilter,
  Rows3,
  Search,
  SlidersHorizontal,
  Trash2,
  X
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/cn"
import type {
  FieldDef,
  FilterRule,
  SavedView,
  SortRule,
  ViewConfig,
  ViewLayout
} from "@/lib/views/types"

import { FieldPickerMenu } from "./field-picker-menu"
import { FilterMenu, describeFilter } from "./filter-menu"
import { SaveViewDialog } from "./save-view-dialog"
import { SortMenu, describeSort } from "./sort-menu"
import { ViewOptionsMenu, type ViewFacet } from "./view-options-menu"
import { PopoverRow, ViewPopover, focusRing, focusWithinField } from "./view-popover"

type MenuKey = "views" | "options" | ViewFacet

export interface ViewBarProps<T> {
  fields: FieldDef<T>[]
  /** Unfiltered record set — powers `dynamicOptions` in the filter menu. */
  records: T[]
  config: ViewConfig
  views: SavedView[]
  activeView: SavedView
  dirty: boolean
  /** Records matching the current config, rendered as the result count. */
  resultCount: number

  onSelectView: (id: string) => void
  onDeleteView: (id: string) => void
  onSaveAsNewView: (name: string) => void
  onReset: () => void

  onSetLayout: (layout: ViewLayout) => void
  onSetGroupBy: (fieldId: string | null) => void
  onSetQuery: (query: string) => void
  onToggleHidden: (fieldId: string) => void

  onAddFilter: (rule: FilterRule) => void
  onUpdateFilter: (index: number, rule: FilterRule) => void
  onRemoveFilter: (index: number) => void

  onAddSort: (rule: SortRule) => void
  onUpdateSort: (index: number, rule: SortRule) => void
  onRemoveSort: (index: number) => void

  className?: string
}

/**
 * The view chrome: view picker, search, "Edit view", the promoted facet chips,
 * and the dirty-state save/reset pair.
 *
 * Generic over `<T>` on purpose — nothing in here knows about requests. The
 * same bar drives Equipment and Incidents once those get field definitions.
 */
export function ViewBar<T>({
  fields,
  records,
  config,
  views,
  activeView,
  dirty,
  resultCount,
  onSelectView,
  onDeleteView,
  onSaveAsNewView,
  onReset,
  onSetLayout,
  onSetGroupBy,
  onSetQuery,
  onToggleHidden,
  onAddFilter,
  onUpdateFilter,
  onRemoveFilter,
  onAddSort,
  onUpdateSort,
  onRemoveSort,
  className
}: ViewBarProps<T>) {
  const [openMenu, setOpenMenu] = React.useState<MenuKey | null>(null)
  /** Facets shown as chips even before they hold any rules. */
  const [promoted, setPromoted] = React.useState<ViewFacet[]>([])
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [saveOpen, setSaveOpen] = React.useState(false)

  const viewsRef = React.useRef<HTMLButtonElement>(null)
  const optionsRef = React.useRef<HTMLButtonElement>(null)
  const filterRef = React.useRef<HTMLButtonElement>(null)
  const sortRef = React.useRef<HTMLButtonElement>(null)
  const groupRef = React.useRef<HTMLButtonElement>(null)
  const hiddenRef = React.useRef<HTMLButtonElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)

  const close = React.useCallback(() => setOpenMenu(null), [])

  const groupField = config.groupBy
    ? fields.find((f) => f.id === config.groupBy)
    : undefined

  const shown = {
    group: config.groupBy != null || promoted.includes("group"),
    filter: config.filters.length > 0 || promoted.includes("filter"),
    sort: config.sorts.length > 0 || promoted.includes("sort"),
    hidden: config.hidden.length > 0 || promoted.includes("hidden")
  }

  // Chips animate in staggered, in the order they appear on the row.
  let chipIndex = 0
  const nextDelay = () => `${chipIndex++ * 40}ms`

  function promote(facet: ViewFacet) {
    setPromoted((prev) => (prev.includes(facet) ? prev : [...prev, facet]))
    setOpenMenu(facet)
  }

  function openSearch() {
    setSearchOpen(true)
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  function collapseSearch() {
    setSearchOpen(false)
    if (config.query) onSetQuery("")
  }

  function handleReset() {
    onReset()
    setPromoted([])
    setSearchOpen(false)
  }

  const visibleIds = fields.filter((f) => !config.hidden.includes(f.id)).map((f) => f.id)
  const primaryIds = fields.filter((f) => f.primary).map((f) => f.id)

  return (
    <div
      className={cn(
        // 48px tall: one 32px control row inside 8px of padding. Every child is
        // 32px so the bar reads as a single row rather than assorted controls.
        "flex flex-wrap items-center gap-2 border-b border-border bg-canvas px-4 py-2 sm:px-6",
        className
      )}
    >
      {/* Left rail — scrolls horizontally rather than stacking into a tall pile
          on narrow screens. */}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 overflow-x-auto",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        {/* View picker */}
        <ChipButton
          ref={viewsRef}
          active={openMenu === "views"}
          onClick={() => setOpenMenu(openMenu === "views" ? null : "views")}
          aria-haspopup="dialog"
          aria-expanded={openMenu === "views"}
        >
          <span className="font-medium text-foreground">{activeView.name}</span>
          <ChevronDown className={chevron} aria-hidden />
        </ChipButton>

        {/* Search — expands in place */}
        <div
          className={cn(
            "group relative h-8 shrink-0 rounded-md border transition-[width,background,border-color]",
            "duration-[180ms] ease-[var(--ease-out-quart)]",
            searchOpen
              ? cn("w-[168px] border-border bg-surface sm:w-[220px]", focusWithinField)
              : "w-8 border-transparent"
          )}
        >
          <button
            type="button"
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={openSearch}
            tabIndex={searchOpen ? -1 : 0}
            className={cn(
              "absolute inset-y-0 left-0 flex w-8 cursor-pointer items-center justify-center rounded-md",
              "text-muted transition-colors duration-100 ease-out",
              searchOpen
                ? "pointer-events-none text-faint group-focus-within:text-muted"
                : "hover:bg-surface-subtle hover:text-foreground",
              focusRing
            )}
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>
          <input
            ref={searchRef}
            type="text"
            value={config.query}
            onChange={(e) => onSetQuery(e.target.value)}
            onBlur={() => { if (!config.query) setSearchOpen(false) }}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return
              e.preventDefault()
              e.stopPropagation()
              collapseSearch()
            }}
            placeholder="Search…"
            aria-label="Search records"
            aria-hidden={!searchOpen}
            tabIndex={searchOpen ? 0 : -1}
            className={cn(
              // Focus is carried by the wrapper's border shift, not a ring on
              // the input — see `focusWithinField`.
              "h-full w-full rounded-md bg-transparent pl-8 pr-8 text-[13px] text-foreground",
              "outline-none placeholder:text-faint transition-opacity duration-[120ms] ease-out",
              searchOpen ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          />
          {searchOpen && config.query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={collapseSearch}
              className={cn(
                "absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center",
                "justify-center rounded text-faint transition-colors duration-100 ease-out hover:text-foreground",
                focusRing
              )}
            >
              {/* 12px: a clear affordance inside the field, not a toolbar icon. */}
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </div>

        {/* Edit view */}
        <ChipButton
          ref={optionsRef}
          iconOnly
          active={openMenu === "options"}
          aria-label="Edit view"
          aria-haspopup="dialog"
          aria-expanded={openMenu === "options"}
          onClick={() => setOpenMenu(openMenu === "options" ? null : "options")}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
        </ChipButton>

        {(shown.group || shown.filter || shown.sort || shown.hidden) && (
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
        )}

        {shown.group && (
          <ChipButton
            ref={groupRef}
            delay={nextDelay()}
            configured={config.groupBy != null}
            active={openMenu === "group"}
            aria-haspopup="dialog"
            aria-expanded={openMenu === "group"}
            onClick={() => setOpenMenu(openMenu === "group" ? null : "group")}
          >
            <Rows3 className="h-4 w-4 shrink-0 text-faint" aria-hidden />
            <span>
              Group by
              {groupField && <span className="text-foreground">: {groupField.label}</span>}
            </span>
            <ChevronDown className={chevron} aria-hidden />
          </ChipButton>
        )}

        {shown.filter && (
          <ChipButton
            ref={filterRef}
            delay={nextDelay()}
            configured={config.filters.length > 0}
            active={openMenu === "filter"}
            aria-haspopup="dialog"
            aria-expanded={openMenu === "filter"}
            onClick={() => setOpenMenu(openMenu === "filter" ? null : "filter")}
          >
            <ListFilter className="h-4 w-4 shrink-0 text-faint" aria-hidden />
            <span>
              {config.filters.length === 1
                ? describeFilter(config.filters[0], fields)
                : "Filter"}
            </span>
            <ChipCount value={config.filters.length} />
            <ChevronDown className={chevron} aria-hidden />
          </ChipButton>
        )}

        {shown.sort && (
          <ChipButton
            ref={sortRef}
            delay={nextDelay()}
            configured={config.sorts.length > 0}
            active={openMenu === "sort"}
            aria-haspopup="dialog"
            aria-expanded={openMenu === "sort"}
            onClick={() => setOpenMenu(openMenu === "sort" ? null : "sort")}
          >
            <ArrowUpDown className="h-4 w-4 shrink-0 text-faint" aria-hidden />
            <span>
              {config.sorts.length === 1 ? describeSort(config.sorts[0], fields) : "Sort"}
            </span>
            <ChipCount value={config.sorts.length} />
            <ChevronDown className={chevron} aria-hidden />
          </ChipButton>
        )}

        {shown.hidden && (
          <ChipButton
            ref={hiddenRef}
            delay={nextDelay()}
            configured={config.hidden.length > 0}
            active={openMenu === "hidden"}
            aria-haspopup="dialog"
            aria-expanded={openMenu === "hidden"}
            onClick={() => setOpenMenu(openMenu === "hidden" ? null : "hidden")}
          >
            <EyeOff className="h-4 w-4 shrink-0 text-faint" aria-hidden />
            <span>
              {config.hidden.length > 0 ? `${config.hidden.length} hidden` : "Hide fields"}
            </span>
            <ChevronDown className={chevron} aria-hidden />
          </ChipButton>
        )}
      </div>

      {/* Right rail — dirty controls, then the result count */}
      <div className="flex shrink-0 items-center gap-2">
        {dirty && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="animate-slide-up"
              style={{ animationDuration: "180ms", animationFillMode: "backwards" }}
            >
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => setSaveOpen(true)}
              className="animate-slide-up"
              style={{
                animationDuration: "180ms",
                animationDelay: "40ms",
                animationFillMode: "backwards"
              }}
            >
              Save as new view
            </Button>
            {/* Separates the transient dirty controls from the standing count,
                so the pair doesn't read as part of the same group. */}
            <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
          </>
        )}
        <span className="whitespace-nowrap text-[12px] text-faint">
          <span className="tabular-nums">{resultCount}</span>
          <span className="hidden sm:inline"> {resultCount === 1 ? "result" : "results"}</span>
        </span>
      </div>

      {/* ── Popovers ───────────────────────────────────── */}

      <ViewPopover
        open={openMenu === "views"}
        onClose={close}
        triggerRef={viewsRef}
        label="Views"
        width={256}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {views.map((view) => (
            <div key={view.id} className="group/view relative">
              <PopoverRow
                // Trailing check, matching the field picker and filter chips —
                // the mark follows the thing it confirms. The empty span holds
                // the slot so names don't shift when the active view changes.
                trailing={
                  view.id === activeView.id ? (
                    <Check className="text-primary" aria-hidden />
                  ) : (
                    <span className="block h-4 w-4" />
                  )
                }
                className={view.system ? undefined : "pr-8"}
                onClick={() => {
                  onSelectView(view.id)
                  close()
                }}
              >
                {view.name}
              </PopoverRow>
              {!view.system && (
                <button
                  type="button"
                  aria-label={`Delete view ${view.name}`}
                  onClick={() => onDeleteView(view.id)}
                  className={cn(
                    "absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center",
                    "justify-center rounded text-faint transition-[opacity,color] duration-100 ease-out",
                    "opacity-0 hover:text-danger group-hover/view:opacity-100 focus-visible:opacity-100",
                    focusRing
                  )}
                >
                  {/* 14px: a row-level affordance that must stay quieter than
                      the 16px field icons it sits beside. */}
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          ))}
        </div>
      </ViewPopover>

      <ViewOptionsMenu
        open={openMenu === "options"}
        onClose={close}
        triggerRef={optionsRef}
        layout={config.layout}
        onSetLayout={onSetLayout}
        onPickFacet={promote}
        counts={{
          filter: config.filters.length,
          sort: config.sorts.length,
          hidden: config.hidden.length,
          group: config.groupBy ? 1 : 0
        }}
      />

      <FieldPickerMenu
        open={openMenu === "group"}
        onClose={close}
        triggerRef={groupRef}
        label="Group by"
        fields={fields.filter((f) => f.groupable !== false && f.groupKey)}
        checkedIds={config.groupBy ? [config.groupBy] : []}
        onPick={(id) => onSetGroupBy(id === config.groupBy ? null : id)}
        footer={
          config.groupBy ? (
            <PopoverRow
              tone="danger"
              icon={<X aria-hidden />}
              onClick={() => {
                onSetGroupBy(null)
                close()
              }}
            >
              Remove group by
            </PopoverRow>
          ) : undefined
        }
      />

      <FieldPickerMenu
        open={openMenu === "hidden"}
        onClose={close}
        triggerRef={hiddenRef}
        label="Hide fields"
        fields={fields}
        multi
        checkedIds={visibleIds}
        disabledIds={primaryIds}
        onPick={onToggleHidden}
      />

      <FilterMenu
        open={openMenu === "filter"}
        onClose={close}
        triggerRef={filterRef}
        fields={fields}
        records={records}
        filters={config.filters}
        onAdd={onAddFilter}
        onUpdate={onUpdateFilter}
        onRemove={onRemoveFilter}
      />

      <SortMenu
        open={openMenu === "sort"}
        onClose={close}
        triggerRef={sortRef}
        fields={fields}
        sorts={config.sorts}
        onAdd={onAddSort}
        onUpdate={onUpdateSort}
        onRemove={onRemoveSort}
      />

      <SaveViewDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSave={onSaveAsNewView}
        defaultName={`${activeView.name} copy`}
      />
    </div>
  )
}

/**
 * Disclosure glyph for the chips. 12px rather than §15's 16px on purpose: a
 * chevron is punctuation on the label, and at 16px it competes with the leading
 * facet icon for the same weight.
 */
const chevron = "h-3 w-3 shrink-0 text-faint"

/** Count badge shown only when a facet holds more than one rule. */
function ChipCount({ value }: { value: number }) {
  if (value < 2) return null
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-xs px-1",
        "bg-surface-subtle text-[11px] font-medium tabular-nums text-muted"
      )}
    >
      {value}
    </span>
  )
}

interface ChipButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** The popover anchored to this chip is open. */
  active?: boolean
  /** The facet actually holds rules — reads stronger than a promoted-but-empty chip. */
  configured?: boolean
  iconOnly?: boolean
  /** Stagger offset for the enter animation. */
  delay?: string
}

const ChipButton = React.forwardRef<HTMLButtonElement, ChipButtonProps>(
  ({ active, configured, iconOnly, delay, className, children, style, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      style={
        delay
          ? {
              animationDelay: delay,
              animationDuration: "180ms",
              animationFillMode: "backwards",
              ...style
            }
          : style
      }
      className={cn(
        // 32px / 10px horizontal / 13px text — the Small button spec (§12.3),
        // so chips, Reset and Save all sit on the same line without adjustment.
        "inline-flex h-8 shrink-0 cursor-pointer select-none items-center gap-2 rounded-md border",
        "text-[13px] whitespace-nowrap",
        "transition-[background,border-color,color,transform] duration-[120ms] ease-[var(--ease-out-quart)]",
        focusRing,
        "active:scale-[0.98]",
        iconOnly ? "w-8 justify-center" : "px-2.5",
        active || configured
          ? "border-border-strong bg-surface text-foreground"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground",
        delay && "animate-slide-up",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
)
ChipButton.displayName = "ChipButton"
