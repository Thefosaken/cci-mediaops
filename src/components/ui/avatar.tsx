import { cn } from "@/lib/utils/cn"

interface AvatarProps {
  name?: string | null
  email?: string | null
  size?: "xs" | "sm" | "default" | "lg"
  className?: string
  src?: string | null
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0]?.slice(0, 2).toUpperCase() ?? "?"
  }
  if (email) return email.slice(0, 2).toUpperCase()
  return "?"
}

// Deterministic color from name — calm palette
const COLORS = [
  "bg-[#E5484D]/12 text-[#C13539]",
  "bg-[#1E5FCE]/12 text-[#1E5FCE]",
  "bg-[#16803C]/12 text-[#16803C]",
  "bg-[#B05A00]/12 text-[#B05A00]",
  "bg-[#7C3AED]/12 text-[#7C3AED]",
  "bg-[#0891B2]/12 text-[#0891B2]",
  "bg-[#DB2777]/12 text-[#DB2777]",
]

function hashIndex(input: string, modulo: number): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % modulo
}

export function Avatar({ name, email, size = "default", className, src }: AvatarProps) {
  const initials = getInitials(name, email)
  const colorIdx = hashIndex(name ?? email ?? "?", COLORS.length)
  const color = COLORS[colorIdx]

  const sizeClasses = {
    xs: "h-5 w-5 text-[9px]",
    sm: "h-6 w-6 text-[10px]",
    default: "h-7 w-7 text-[11px]",
    lg: "h-9 w-9 text-[13px]",
  }[size]

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? "User"}
        className={cn(
          "rounded-full object-cover ring-1 ring-border shrink-0",
          sizeClasses,
          className
        )}
      />
    )
  }

  return (
    <span
      title={name ?? email ?? undefined}
      aria-label={name ?? email ?? "User"}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold select-none shrink-0",
        "ring-1 ring-border",
        color,
        sizeClasses,
        className
      )}
    >
      {initials}
    </span>
  )
}

/** Stack of avatars with overflow indicator. */
export function AvatarStack({
  items,
  max = 3,
  size = "sm",
}: {
  items: { name?: string | null; email?: string | null }[]
  max?: number
  size?: AvatarProps["size"]
}) {
  const visible = items.slice(0, max)
  const overflow = items.length - max
  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((item, i) => (
        <Avatar key={i} name={item.name} email={item.email} size={size} className="ring-2 ring-surface" />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-surface-subtle text-faint font-semibold ring-2 ring-surface",
            size === "xs" ? "h-5 w-5 text-[9px]" : size === "sm" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-[11px]"
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
