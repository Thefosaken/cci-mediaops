/**
 * View system — the shared contract between the view chrome (toolbar, popovers)
 * and the layouts (table, board).
 *
 * The principle borrowed from Slack Lists: a screen is not "a list plus filters".
 * It is a *record set* with a *view configuration* layered on top. Filter, sort,
 * grouping, field visibility, and layout are all facets of one config object that
 * can be reset, shared via URL, and saved as a named view.
 */

export type FieldType =
  | "text"
  | "person"
  | "select"
  | "status"
  | "date"
  | "multi"
  | "number"
  | "link"
  | "boolean"

/** A rendered cell value, normalised so layouts never touch the raw record. */
export type FieldValue =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "date"; iso: string }
  | { kind: "person"; name: string; email?: string | null }
  | { kind: "select"; value: string; label: string }
  | { kind: "status"; value: string }
  | { kind: "multi"; items: { value: string; label: string }[] }
  | { kind: "link"; href: string; label: string }

export interface FieldOption {
  value: string
  label: string
}

/**
 * Describes one column/field of the record set. Everything the view engine and
 * the chrome need to reason about a field lives here — no field-specific
 * branching anywhere else.
 */
export interface FieldDef<T> {
  id: string
  label: string
  type: FieldType
  /** Lucide icon name rendered in field pickers. */
  icon: string
  /** Normalised cell value for rendering. */
  value: (record: T) => FieldValue
  /**
   * Key used for grouping and equality filtering. Return null for "no value"
   * (grouped under "Ungrouped"). Multi fields may return several keys — the
   * record then appears in each matching group.
   */
  groupKey?: (record: T) => string | string[] | null
  /** Human label for a group key, e.g. "in_progress" -> "In progress". */
  groupLabel?: (key: string) => string
  /** Comparable value for sorting. */
  sortValue?: (record: T) => string | number | null
  /** Fixed option set for select/status fields — powers filter menus. */
  options?: FieldOption[]
  /** Discovered options for open sets (people, units) when `options` is absent. */
  dynamicOptions?: (records: T[]) => FieldOption[]
  groupable?: boolean
  sortable?: boolean
  filterable?: boolean
  /** Primary field is always visible and anchors the row/card. */
  primary?: boolean
  /** Preferred column width in the table layout, e.g. "180px" or "minmax(0,1fr)". */
  width?: string
}

export type FilterOperator = "is" | "is_not" | "is_any_of" | "is_empty" | "is_not_empty"

export interface FilterRule {
  fieldId: string
  operator: FilterOperator
  /** Values the operator compares against. Empty for is_empty/is_not_empty. */
  values: string[]
}

export interface SortRule {
  fieldId: string
  direction: "asc" | "desc"
}

export type ViewLayout = "table" | "board"

export interface ViewConfig {
  layout: ViewLayout
  filters: FilterRule[]
  sorts: SortRule[]
  groupBy: string | null
  /** Field ids explicitly hidden. Primary fields ignore this. */
  hidden: string[]
  query: string
}

export interface SavedView {
  id: string
  name: string
  config: ViewConfig
  /** Built-in views ship with the app and cannot be deleted. */
  system?: boolean
}

export interface ViewGroup<T> {
  key: string
  label: string
  records: T[]
}

export const EMPTY_VIEW: ViewConfig = {
  layout: "table",
  filters: [],
  sorts: [],
  groupBy: null,
  hidden: [],
  query: ""
}

export const UNGROUPED_KEY = "__ungrouped__"
