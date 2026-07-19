import {
  Activity,
  AlignLeft,
  Bookmark,
  Briefcase,
  Building2,
  Calendar,
  CalendarClock,
  Camera,
  Circle,
  CircleCheck,
  CircleDot,
  Clock,
  FileText,
  Flag,
  Folder,
  Hash,
  Layers,
  Link2,
  List,
  Mail,
  MapPin,
  Megaphone,
  Package,
  Star,
  Tag,
  Tags,
  ToggleLeft,
  TriangleAlert,
  Type,
  User,
  Users,
  Zap
} from "lucide-react"

import { cn } from "@/lib/utils/cn"
import type { FieldType } from "@/lib/views/types"

type IconComponent = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>

/**
 * Maps a `FieldDef.icon` string to a Lucide component. Keys are normalised so
 * "align-left", "alignLeft" and "AlignLeft" all resolve to the same icon —
 * field definitions shouldn't have to remember a casing convention.
 */
const ICONS: Record<string, IconComponent> = {
  activity: Activity,
  alignleft: AlignLeft,
  bookmark: Bookmark,
  briefcase: Briefcase,
  building: Building2,
  building2: Building2,
  calendar: Calendar,
  calendarclock: CalendarClock,
  camera: Camera,
  check: CircleCheck,
  circle: Circle,
  circlecheck: CircleCheck,
  circledot: CircleDot,
  clock: Clock,
  filetext: FileText,
  flag: Flag,
  folder: Folder,
  hash: Hash,
  layers: Layers,
  link: Link2,
  link2: Link2,
  list: List,
  mail: Mail,
  mappin: MapPin,
  megaphone: Megaphone,
  package: Package,
  star: Star,
  tag: Tag,
  tags: Tags,
  text: Type,
  toggleleft: ToggleLeft,
  trianglealert: TriangleAlert,
  type: Type,
  user: User,
  users: Users,
  zap: Zap
}

/** Sensible default per field type when the icon name is unknown or absent. */
const TYPE_FALLBACK: Record<FieldType, IconComponent> = {
  text: Type,
  person: User,
  select: Tag,
  status: CircleDot,
  date: Calendar,
  multi: Tags,
  number: Hash,
  link: Link2,
  boolean: ToggleLeft
}

function normalise(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
}

interface FieldIconProps {
  /** Raw `FieldDef.icon` value. */
  name?: string
  /** Used as a fallback when `name` doesn't resolve. */
  type?: FieldType
  className?: string
}

export function FieldIcon({ name, type, className }: FieldIconProps) {
  const Icon =
    (name ? ICONS[normalise(name)] : undefined) ??
    (type ? TYPE_FALLBACK[type] : undefined) ??
    Circle

  return <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} aria-hidden />
}
