"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { useUrlState } from "@/lib/hooks/use-url-state"

import {
  decodeView,
  encodeView,
  isDirty,
  loadSavedViews,
  storeSavedViews
} from "./engine"
import { EMPTY_VIEW, type FieldDef, type FilterRule, type SavedView, type SortRule, type ViewConfig, type ViewLayout } from "./types"

/** URL param holding the live (possibly dirty) config. */
const CONFIG_PARAM = "view"
/** URL param holding the id of the saved view the config derives from. */
const BASE_PARAM = "v"

const FALLBACK_VIEW: SavedView = {
  id: "all",
  name: "All items",
  config: EMPTY_VIEW,
  system: true
}

export interface UseViewStateOptions<T> {
  /** Namespace for saved views in localStorage, e.g. "requests". */
  scope: string
  fields: FieldDef<T>[]
  /** Built-in views. The first is the default when no `?v=` is present. */
  systemViews: SavedView[]
}

export interface ViewStateMutators {
  setLayout: (layout: ViewLayout) => void
  setGroupBy: (fieldId: string | null) => void
  setQuery: (query: string) => void
  toggleHidden: (fieldId: string) => void
  addFilter: (rule: FilterRule) => void
  updateFilter: (index: number, rule: FilterRule) => void
  removeFilter: (index: number) => void
  addSort: (rule: SortRule) => void
  updateSort: (index: number, rule: SortRule) => void
  removeSort: (index: number) => void
  reset: () => void
  selectView: (id: string) => void
  saveAsNewView: (name: string) => void
  deleteView: (id: string) => void
}

export interface ViewState extends ViewStateMutators {
  config: ViewConfig
  views: SavedView[]
  activeView: SavedView
  dirty: boolean
}

/**
 * Drops anything the field set no longer knows about. A shared URL can outlive
 * a column rename, and a filter on a missing field would silently do nothing —
 * better to discard it than to show a chip that means nothing.
 */
function sanitize<T>(config: ViewConfig, fields: FieldDef<T>[]): ViewConfig {
  const known = new Set(fields.map((f) => f.id))
  return {
    layout: config.layout,
    query: config.query,
    groupBy: config.groupBy && known.has(config.groupBy) ? config.groupBy : null,
    hidden: config.hidden.filter((id) => known.has(id)),
    filters: config.filters.filter((f) => known.has(f.fieldId)),
    sorts: config.sorts.filter((s) => known.has(s.fieldId))
  }
}

function makeId(): string {
  return `view_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Holds one screen's view configuration.
 *
 * The live config lives in the URL (`?view=`), so any configured view is
 * shareable by copying the address bar; the base view id lives in `?v=`. Other
 * params (`?id=`, `?new=`) are owned by other code and are never touched here.
 * Saved views persist to localStorage under `scope`, hydrated in an effect so
 * the server and first client render agree.
 */
export function useViewState<T>({
  scope,
  fields,
  systemViews
}: UseViewStateOptions<T>): ViewState {
  const { get, set } = useUrlState()

  const [customViews, setCustomViews] = useState<SavedView[]>([])

  useEffect(() => {
    setCustomViews(loadSavedViews(scope))
  }, [scope])

  const views = useMemo(
    () => [...systemViews, ...customViews],
    [systemViews, customViews]
  )

  const baseId = get(BASE_PARAM)
  const activeView = useMemo(() => {
    const match = baseId ? views.find((v) => v.id === baseId) : undefined
    return match ?? views[0] ?? FALLBACK_VIEW
  }, [baseId, views])

  const raw = get(CONFIG_PARAM)
  const config = useMemo(
    () => sanitize(decodeView(raw, activeView.config), fields),
    [raw, activeView, fields]
  )

  /**
   * Writes the next config to the URL — but only while it actually differs from
   * the base view. Editing your way back to the base view leaves a clean URL
   * instead of a long encoded param that says "no changes".
   */
  const commit = useCallback(
    (next: ViewConfig) => {
      set({
        [CONFIG_PARAM]: isDirty(next, activeView.config) ? encodeView(next) : null
      })
    },
    [set, activeView]
  )

  const persist = useCallback(
    (next: SavedView[]) => {
      setCustomViews(next)
      storeSavedViews(scope, next)
    },
    [scope]
  )

  const setLayout = useCallback(
    (layout: ViewLayout) => commit({ ...config, layout }),
    [commit, config]
  )

  const setGroupBy = useCallback(
    (fieldId: string | null) => commit({ ...config, groupBy: fieldId }),
    [commit, config]
  )

  const setQuery = useCallback(
    (query: string) => commit({ ...config, query }),
    [commit, config]
  )

  const toggleHidden = useCallback(
    (fieldId: string) => {
      const hidden = config.hidden.includes(fieldId)
        ? config.hidden.filter((id) => id !== fieldId)
        : [...config.hidden, fieldId]
      commit({ ...config, hidden })
    },
    [commit, config]
  )

  const addFilter = useCallback(
    (rule: FilterRule) => commit({ ...config, filters: [...config.filters, rule] }),
    [commit, config]
  )

  const updateFilter = useCallback(
    (index: number, rule: FilterRule) =>
      commit({
        ...config,
        filters: config.filters.map((f, i) => (i === index ? rule : f))
      }),
    [commit, config]
  )

  const removeFilter = useCallback(
    (index: number) =>
      commit({ ...config, filters: config.filters.filter((_, i) => i !== index) }),
    [commit, config]
  )

  const addSort = useCallback(
    (rule: SortRule) => commit({ ...config, sorts: [...config.sorts, rule] }),
    [commit, config]
  )

  const updateSort = useCallback(
    (index: number, rule: SortRule) =>
      commit({
        ...config,
        sorts: config.sorts.map((s, i) => (i === index ? rule : s))
      }),
    [commit, config]
  )

  const removeSort = useCallback(
    (index: number) =>
      commit({ ...config, sorts: config.sorts.filter((_, i) => i !== index) }),
    [commit, config]
  )

  const reset = useCallback(() => {
    set({ [CONFIG_PARAM]: null })
  }, [set])

  const selectView = useCallback(
    (id: string) => {
      set({ [BASE_PARAM]: id, [CONFIG_PARAM]: null })
    },
    [set]
  )

  const saveAsNewView = useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const view: SavedView = { id: makeId(), name: trimmed, config }
      persist([...customViews, view])
      set({ [BASE_PARAM]: view.id, [CONFIG_PARAM]: null })
    },
    [config, customViews, persist, set]
  )

  const deleteView = useCallback(
    (id: string) => {
      const next = customViews.filter((v) => v.id !== id)
      persist(next)
      if (activeView.id !== id) return
      const fallback = systemViews[0] ?? next[0] ?? FALLBACK_VIEW
      set({ [BASE_PARAM]: fallback.id, [CONFIG_PARAM]: null })
    },
    [customViews, persist, activeView, systemViews, set]
  )

  return {
    config,
    views,
    activeView,
    dirty: isDirty(config, activeView.config),
    setLayout,
    setGroupBy,
    setQuery,
    toggleHidden,
    addFilter,
    updateFilter,
    removeFilter,
    addSort,
    updateSort,
    removeSort,
    reset,
    selectView,
    saveAsNewView,
    deleteView
  }
}
