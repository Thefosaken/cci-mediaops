"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { cn } from "@/lib/utils/cn"
import { NAV_ITEMS } from "@/constants"
import {
  LayoutDashboard, Calendar, Inbox, CalendarCheck, ScrollText,
  Users, Wrench, ClipboardCheck, AlertTriangle, BarChart3, Settings,
  X, Search, Plus, ChevronLeft, ChevronRight,
} from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { Kbd } from "@/components/ui/kbd"
import { useSidebarCollapsed } from "@/lib/hooks/use-sidebar-collapsed"
import type { ShellCounts } from "@/server/queries/shell"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Calendar, Inbox, CalendarCheck, ScrollText,
  Users, Wrench, ClipboardCheck, AlertTriangle, BarChart3, Settings,
}

const PRIMARY_NAV = ["/dashboard", "/calendar", "/requests", "/scheduling", "/run-sheets"]
const MANAGE_NAV = ["/sub-teams", "/equipment", "/approvals", "/incidents", "/reports", "/settings"]

// Map nav href → which count surfaces as a badge
function countForHref(href: string, counts?: ShellCounts): number {
  if (!counts) return 0
  switch (href) {
    case "/requests": return counts.pendingRequests
    case "/approvals": return counts.pendingApprovals
    case "/scheduling": return counts.unconfirmedAssignments
    case "/incidents": return counts.openIncidents
    case "/equipment": return counts.equipmentIssues
    default: return 0
  }
}

interface SidebarProps {
  onClose?: () => void
  onCommandOpen: () => void
  counts?: ShellCounts
  campusName?: string
}

export function Sidebar({ onClose, onCommandOpen, counts, campusName }: SidebarProps) {
  const pathname = usePathname()
  const { collapsed, toggle } = useSidebarCollapsed()

  const primaryItems = NAV_ITEMS.filter((i) => PRIMARY_NAV.includes(i.href))
  const manageItems = NAV_ITEMS.filter((i) => MANAGE_NAV.includes(i.href))

  function NavLink({ item }: { item: (typeof NAV_ITEMS)[number] }) {
    const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
    const Icon = iconMap[item.icon]
    const badge = countForHref(item.href, counts)

    return (
      <Link
        href={item.href}
        onClick={onClose}
        title={collapsed ? item.label : undefined}
        className={cn(
          "group relative flex items-center rounded-md transition-colors duration-100",
          collapsed ? "justify-center h-8 w-8 mx-auto" : "gap-2.5 px-2 h-8",
          isActive
            ? "bg-surface-subtle text-foreground"
            : "text-muted hover:text-foreground hover:bg-surface-subtle/60"
        )}
      >
        {Icon && (
          <Icon
            className={cn(
              "shrink-0 transition-colors duration-100",
              "h-[15px] w-[15px]",
              isActive ? "text-foreground" : "text-faint group-hover:text-foreground"
            )}
            aria-hidden="true"
          />
        )}

        {!collapsed && (
          <>
            <span className={cn("truncate text-[13px]", isActive ? "font-medium" : "")}>
              {item.label}
            </span>
            {badge > 0 && (
              <span
                className={cn(
                  "ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-md px-1 text-[10.5px] font-semibold",
                  isActive
                    ? "bg-foreground/10 text-foreground"
                    : "bg-surface-subtle text-muted group-hover:bg-foreground/10 group-hover:text-foreground"
                )}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </>
        )}
        {collapsed && badge > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary"
          />
        )}
      </Link>
    )
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-canvas",
        "transition-[width] duration-200 ease-[var(--ease-out-quart)] overflow-hidden",
        collapsed ? "w-[52px]" : "w-[224px]"
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex items-center shrink-0",
          collapsed ? "justify-center h-14 px-2" : "justify-between h-14 px-3"
        )}
      >
        {collapsed ? (
          <Link href="/dashboard" onClick={onClose} title="CCI MediaOps" className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-surface-subtle transition-colors">
            <Logo className="h-5 w-auto" />
          </Link>
        ) : (
          <>
            <Link href="/dashboard" onClick={onClose} className="group flex items-center gap-2 min-w-0">
              <Logo className="h-6 w-auto shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-[12.5px] font-semibold text-foreground tracking-tight leading-none truncate">
                  MediaOps
                </span>
                <span className="text-[10px] text-faint truncate leading-tight mt-0.5">
                  {campusName ?? "CCI"}
                </span>
              </div>
            </Link>
            {onClose && (
              <button
                onClick={onClose}
                className="rounded-md p-1 text-faint hover:text-foreground hover:bg-surface-subtle transition-colors"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Search / command trigger */}
      <div className={cn("shrink-0", collapsed ? "px-2 pb-2" : "px-3 pb-2")}>
        {collapsed ? (
          <button
            type="button"
            onClick={onCommandOpen}
            title="Search (⌘K)"
            aria-label="Search"
            className="flex items-center justify-center h-8 w-8 mx-auto rounded-md text-faint hover:text-foreground hover:bg-surface-subtle transition-colors"
          >
            <Search className="h-[15px] w-[15px]" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onCommandOpen}
            className={cn(
              "group flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2 h-8",
              "text-[12.5px] text-faint",
              "hover:bg-surface-hover hover:border-border-strong hover:text-muted transition-colors"
            )}
          >
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Search…</span>
            <Kbd size="sm">⌘K</Kbd>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-1" aria-label="Main navigation">
        <div className={cn("space-y-0.5", collapsed ? "px-2" : "px-2")}>
          {primaryItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        {!collapsed && (
          <div className="px-3 pt-5 pb-1.5">
            <span className="text-[10px] font-semibold text-faint uppercase tracking-wider">
              Manage
            </span>
          </div>
        )}
        {collapsed && <div className="my-3 mx-3 h-px bg-border" aria-hidden="true" />}

        <div className={cn("space-y-0.5", collapsed ? "px-2" : "px-2")}>
          {manageItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
      </nav>

      {/* Footer: new request shortcut + collapse */}
      <div className={cn("border-t border-border shrink-0", collapsed ? "px-2 py-2" : "p-2")}>
        {!collapsed && (
          <Link
            href="/requests?new=1"
            className="mb-1.5 flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2 h-8 text-[12.5px] text-foreground hover:bg-surface-hover hover:border-border-strong transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
            <span className="flex-1 text-left">New request</span>
            <Kbd size="sm">N</Kbd>
          </Link>
        )}
        <button
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex w-full items-center rounded-md text-faint h-8",
            "hover:text-foreground hover:bg-surface-subtle transition-colors",
            collapsed ? "justify-center" : "px-2 gap-2"
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
          ) : (
            <>
              <ChevronLeft className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
              <span className="text-[12px]">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
