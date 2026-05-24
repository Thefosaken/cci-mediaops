"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils/cn"
import { NAV_ITEMS } from "@/constants"
import {
  LayoutDashboard, Calendar, Inbox, CalendarCheck, ScrollText,
  Users, Wrench, ClipboardCheck, AlertTriangle, BarChart3, Settings,
  X, ChevronLeft, ChevronRight,
} from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { useSidebarCollapsed } from "@/lib/hooks/use-sidebar-collapsed"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Calendar, Inbox, CalendarCheck, ScrollText,
  Users, Wrench, ClipboardCheck, AlertTriangle, BarChart3, Settings,
}

const PRIMARY_NAV  = ["/dashboard", "/calendar", "/requests", "/scheduling", "/run-sheets"]
const MANAGE_NAV   = ["/sub-teams", "/equipment", "/approvals", "/incidents", "/reports", "/settings"]

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname   = usePathname()
  const { collapsed, toggle } = useSidebarCollapsed()

  const primaryItems  = NAV_ITEMS.filter((i) => PRIMARY_NAV.includes(i.href))
  const manageItems   = NAV_ITEMS.filter((i) => MANAGE_NAV.includes(i.href))

  function NavLink({ item }: { item: (typeof NAV_ITEMS)[number] }) {
    const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
    const Icon     = iconMap[item.icon]

    return (
      <Link
        href={item.href}
        onClick={onClose}
        title={collapsed ? item.label : undefined}
        className={cn(
          "group relative flex items-center rounded-lg transition-colors duration-150",
          collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
          isActive
            ? "bg-surface-subtle text-foreground font-medium"
            : "text-muted hover:text-foreground hover:bg-surface-subtle"
        )}
      >
        {/* Subtle 2px left accent — only visible when expanded */}
        {!collapsed && (
          <span
            className={cn(
              "absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-full transition-all duration-150",
              isActive ? "h-5 bg-primary" : "h-0"
            )}
            aria-hidden="true"
          />
        )}

        {Icon && (
          <Icon
            className={cn(
              "shrink-0 transition-colors duration-150",
              collapsed ? "h-5 w-5" : "h-4 w-4",
              isActive ? "text-foreground" : "text-muted group-hover:text-foreground"
            )}
          />
        )}

        {!collapsed && <span className="truncate text-sm">{item.label}</span>}
      </Link>
    )
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-surface",
        "transition-[width] duration-200 ease-standard overflow-hidden",
        collapsed ? "w-14" : "w-64"
      )}
    >
      {/* Logo area */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-border shrink-0",
          collapsed ? "justify-center px-2" : "justify-between px-5"
        )}
      >
        {collapsed ? (
          <Link href="/dashboard" onClick={onClose} title="CCI MediaOps">
            <Logo className="h-7 w-auto" />
          </Link>
        ) : (
          <>
            <Link href="/dashboard" onClick={onClose} className="flex items-center gap-2.5">
              <Logo className="h-8 w-auto" />
              <span className="text-[13px] font-semibold text-foreground tracking-tight truncate">
                MediaOps
              </span>
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
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3" aria-label="Main navigation">
        {/* Primary section */}
        <div className={cn("space-y-0.5", collapsed ? "px-2" : "px-3")}>
          {primaryItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        {/* Section divider */}
        {!collapsed && (
          <div className="mx-3 my-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-border" aria-hidden="true" />
            <span className="text-[10px] font-semibold text-faint uppercase tracking-widest select-none">
              Manage
            </span>
            <div className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
        )}
        {collapsed && <div className="my-2 mx-2 h-px bg-border" aria-hidden="true" />}

        {/* Manage section */}
        <div className={cn("space-y-0.5", collapsed ? "px-2" : "px-3")}>
          {manageItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
      </nav>

      {/* Footer: collapse toggle + version */}
      <div className={cn("border-t border-border shrink-0", collapsed ? "px-2 py-3" : "px-4 py-3")}>
        <button
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex w-full items-center rounded-lg px-2 py-2 text-faint",
            "hover:text-foreground hover:bg-surface-subtle transition-colors duration-150",
            collapsed ? "justify-center" : "gap-3"
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>

        {!collapsed && (
          <span className="mt-2 block text-[10px] font-medium text-faint">v0.1 · Internal</span>
        )}
      </div>
    </aside>
  )
}
