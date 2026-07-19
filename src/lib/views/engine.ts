import {
  EMPTY_VIEW,
  UNGROUPED_KEY,
  type FieldDef,
  type FieldValue,
  type FilterRule,
  type SavedView,
  type SortRule,
  type ViewConfig,
  type ViewGroup
} from "./types"

/** Flattens a field value to searchable text. */
export function valueToText(value: FieldValue): string {
  switch (value.kind) {
    case "empty": return ""
    case "text": return value.text
    case "number": return String(value.value)
    case "boolean": return value.value ? "yes" : "no"
    case "date": return value.iso
    case "person": return value.name
    case "select": return value.label
    case "status": return value.value
    case "multi": return value.items.map((i) => i.label).join(" ")
    case "link": return `${value.label} ${value.href}`
  }
}

function keysFor<T>(field: FieldDef<T>, record: T): string[] {
  const raw = field.groupKey?.(record) ?? null
  if (raw == null) return []
  return Array.isArray(raw) ? raw : [raw]
}

function matches<T>(record: T, rule: FilterRule, fields: FieldDef<T>[]): boolean {
  const field = fields.find((f) => f.id === rule.fieldId)
  if (!field) return true
  const keys = keysFor(field, record)

  switch (rule.operator) {
    case "is_empty": return keys.length === 0
    case "is_not_empty": return keys.length > 0
    case "is":
    case "is_any_of": return keys.some((k) => rule.values.includes(k))
    case "is_not": return !keys.some((k) => rule.values.includes(k))
  }
}

function compare<T>(a: T, b: T, rule: SortRule, fields: FieldDef<T>[]): number {
  const field = fields.find((f) => f.id === rule.fieldId)
  if (!field?.sortValue) return 0
  const av = field.sortValue(a)
  const bv = field.sortValue(b)

  // Empty values always sink to the bottom regardless of direction — an unset
  // deadline is not "earliest", it is unknown.
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1

  const dir = rule.direction === "asc" ? 1 : -1
  if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir
  return String(av).localeCompare(String(bv)) * dir
}

export interface ViewResult<T> {
  /** Flat, filtered + sorted records. */
  records: T[]
  /** Present only when `config.groupBy` is set. */
  groups: ViewGroup<T>[] | null
  /** Fields visible in this view, in display order, primary first. */
  visibleFields: FieldDef<T>[]
  total: number
}

export interface ApplyViewOptions {
  /**
   * Keep groups that ended up with no records, for fields with a fixed option
   * set. The board needs this: a status column with zero requests still has to
   * render, or there is nowhere to drop the first card. The table does not —
   * empty section headers there are just noise.
   */
  includeEmptyGroups?: boolean
}

export function applyView<T>(
  records: T[],
  fields: FieldDef<T>[],
  config: ViewConfig,
  options: ApplyViewOptions = {}
): ViewResult<T> {
  let list = records

  if (config.filters.length > 0) {
    list = list.filter((r) => config.filters.every((rule) => matches(r, rule, fields)))
  }

  const q = config.query.trim().toLowerCase()
  if (q) {
    list = list.filter((r) =>
      fields.some((f) => valueToText(f.value(r)).toLowerCase().includes(q))
    )
  }

  if (config.sorts.length > 0) {
    list = [...list].sort((a, b) => {
      for (const rule of config.sorts) {
        const result = compare(a, b, rule, fields)
        if (result !== 0) return result
      }
      return 0
    })
  }

  const visibleFields = fields.filter((f) => f.primary || !config.hidden.includes(f.id))

  let groups: ViewGroup<T>[] | null = null
  if (config.groupBy) {
    const field = fields.find((f) => f.id === config.groupBy)
    if (field) {
      const buckets = new Map<string, T[]>()
      const ungrouped: T[] = []

      for (const record of list) {
        const keys = keysFor(field, record)
        if (keys.length === 0) {
          ungrouped.push(record)
          continue
        }
        for (const key of keys) {
          const bucket = buckets.get(key)
          if (bucket) bucket.push(record)
          else buckets.set(key, [record])
        }
      }

      // Fixed option sets keep their declared order so status columns read as a
      // pipeline rather than shuffling as data changes.
      const ordered = field.options
        ? field.options
            .map((o) => o.value)
            .filter((v) => options.includeEmptyGroups || buckets.has(v))
        : [...buckets.keys()].sort((a, b) =>
            (field.groupLabel?.(a) ?? a).localeCompare(field.groupLabel?.(b) ?? b)
          )

      groups = ordered.map((key) => ({
        key,
        label: field.groupLabel?.(key) ?? key,
        records: buckets.get(key) ?? []
      }))

      if (ungrouped.length > 0) {
        groups.unshift({ key: UNGROUPED_KEY, label: "Ungrouped", records: ungrouped })
      }
    }
  }

  return { records: list, groups, visibleFields, total: list.length }
}

/** True when the config differs from the view it was derived from. */
export function isDirty(config: ViewConfig, base: ViewConfig): boolean {
  return serializeView(config) !== serializeView(base)
}

/** Stable string form, used for dirty-checking and URL encoding. */
export function serializeView(config: ViewConfig): string {
  return JSON.stringify({
    layout: config.layout,
    groupBy: config.groupBy,
    query: config.query,
    hidden: [...config.hidden].sort(),
    sorts: config.sorts,
    filters: config.filters.map((f) => ({ ...f, values: [...f.values].sort() }))
  })
}

export function encodeView(config: ViewConfig): string {
  return serializeView(config)
}

export function decodeView(raw: string | null, fallback: ViewConfig = EMPTY_VIEW): ViewConfig {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as Partial<ViewConfig>
    return {
      layout: parsed.layout === "board" ? "board" : "table",
      filters: Array.isArray(parsed.filters) ? parsed.filters : [],
      sorts: Array.isArray(parsed.sorts) ? parsed.sorts : [],
      groupBy: typeof parsed.groupBy === "string" ? parsed.groupBy : null,
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
      query: typeof parsed.query === "string" ? parsed.query : ""
    }
  } catch {
    return fallback
  }
}

const STORAGE_KEY = "cci-mediaops:saved-views"

export function loadSavedViews(scope: string): SavedView[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:${scope}`)
    return raw ? (JSON.parse(raw) as SavedView[]) : []
  } catch {
    return []
  }
}

export function storeSavedViews(scope: string, views: SavedView[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(`${STORAGE_KEY}:${scope}`, JSON.stringify(views))
  } catch {
    // Storage unavailable (private mode, quota) — views stay session-only.
  }
}
