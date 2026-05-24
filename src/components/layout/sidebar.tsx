"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils/cn"
import { NAV_ITEMS } from "@/constants"
import {
  LayoutDashboard,
  Calendar,
  Inbox,
  CalendarCheck,
  ScrollText,
  Users,
  Wrench,
  ClipboardCheck,
  AlertTriangle,
  BarChart3,
  Settings,
  X,
} from "lucide-react"
import { Logo } from "@/components/ui/logo"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Calendar,
  Inbox,
  CalendarCheck,
  ScrollText,
  Users,
  Wrench,
  ClipboardCheck,
  AlertTriangle,
  BarChart3,
  Settings,
}

// Navigation sections: primary (top) and management (bottom)
const PRIMARY_NAV = ["/dashboard", "/calendar", "/requests", "/scheduling", "/run-sheets"]
const MANAGEMENT_NAV = ["/sub-teams", "/equipment", "/approvals", "/incidents", "/reports", "/settings"]

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()

  const primaryItems = NAV_ITEMS.filter((item) => PRIMARY_NAV.includes(item.href))
  const managementItems = NAV_ITEMS.filter((item) => MANAGEMENT_NAV.includes(item.href))

  function NavLink({ item }: { item: (typeof NAV_ITEMS)[number] }) {
    const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
    const Icon = iconMap[item.icon]
    return (
      <Link
        href={item.href}
        onClick={onClose}
        className={cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150",
          isActive
            ? "bg-surface-subtle text-foreground font-medium"
            : "text-muted hover:text-foreground hover:bg-surface-subtle"
        )}
      >
        {/* Left accent bar */}
        <span
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-150",
            isActive ? "h-5 bg-primary" : "h-0 bg-primary"
          )}
          aria-hidden="true"
        />
        {Icon && (
          <Icon
            className={cn(
              "h-4 w-4 shrink-0 transition-all duration-150",
              isActive ? "text-foreground" : "text-muted group-hover:text-foreground"
            )}
          />
        )}
        <span className="truncate">{item.label}</span>
      </Link>
    )
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-surface">
      {/* Logo area */}
      <div className="flex h-16 items-center justify-between border-b border-border px-5">
        <Link
          href="/dashboard"
          onClick={onClose}
          className="flex items-center gap-2.5 group"
        >
          <Logo className="h-8 w-auto" />
          <span className="text-[13px] font-semibold text-foreground tracking-tight">MediaOps</span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-faint hover:text-foreground hover:bg-surface-subtle transition-colors duration-150"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {/* Primary section */}
        <div className="px-3 space-y-0.5">
          {primaryItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        {/* Section divider */}
        <div className="mx-3 my-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-border" aria-hidden="true" />
          <span className="text-[10px] font-semibold text-faint uppercase tracking-widest select-none">
            Manage
          </span>
          <div className="h-px flex-1 bg-border" aria-hidden="true" />
        </div>

        {/* Management section */}
        <div className="px-3 space-y-0.5">
          {managementItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3">
        <span className="inline-flex items-center rounded-md bg-surface-subtle border border-border px-2 py-0.5 text-[10px] font-semibold text-faint tracking-wide uppercase">
          v0.1 · Internal
        </span>
      </div>
    </aside>
  )
}
