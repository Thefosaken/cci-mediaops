"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, ChevronRight, Search } from "lucide-react"
import { NAV_ITEMS } from "@/constants"
import { useBreadcrumb } from "@/lib/hooks/use-breadcrumb"
import { cn } from "@/lib/utils/cn"
import { IconButton } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { NotificationsPopover } from "./notifications-popover"
import { UserMenu } from "./user-menu"
import type { ShellNotification } from "@/server/queries/shell"

interface NavbarProps {
  onMenuClick?: () => void
  onCommandOpen: () => void
  notifications: ShellNotification[]
  unreadCount: number
  userId: string | null
  userName: string | null
  userEmail: string | null
  userRoleLabel?: string | null
}

function Breadcrumb({ pathname }: { pathname: string }) {
  const current = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  )
  // A detail route registers its record's name via useBreadcrumbLabel.
  const { label: recordLabel } = useBreadcrumb()
  const onDetailRoute = Boolean(current && pathname !== current.href)

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] min-w-0">
      <Link
        href="/dashboard"
        className="text-faint hover:text-foreground transition-colors hidden sm:inline shrink-0"
      >
        CCI
      </Link>
      <ChevronRight className="h-3 w-3 text-faint hidden sm:inline shrink-0" aria-hidden="true" />

      {onDetailRoute ? (
        <>
          {/* The section becomes the way back once you are below it. */}
          <Link
            href={current!.href}
            className="text-faint hover:text-foreground transition-colors shrink-0"
          >
            {current!.label}
          </Link>
          <ChevronRight className="h-3 w-3 text-faint shrink-0" aria-hidden="true" />
          <span className="font-medium text-foreground truncate">
            {recordLabel ?? "…"}
          </span>
        </>
      ) : (
        <span className="font-medium text-foreground truncate">
          {current?.label ?? "Dashboard"}
        </span>
      )}
    </nav>
  )
}

export function Navbar({
  onMenuClick,
  onCommandOpen,
  notifications,
  unreadCount,
  userId,
  userName,
  userEmail,
  userRoleLabel,
}: NavbarProps) {
  const pathname = usePathname()

  return (
    <header
      className={cn(
        "flex h-14 items-center justify-between gap-3 border-b border-border bg-canvas",
        "px-3 sm:px-5 shrink-0"
      )}
    >
      {/* Left: hamburger + breadcrumb */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {onMenuClick && (
          <IconButton
            label="Open navigation"
            size="sm"
            onClick={onMenuClick}
            className="lg:hidden"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        )}
        <Breadcrumb pathname={pathname} />
      </div>

      {/* Center: command trigger (sm+, mobile uses sidebar trigger) */}
      <div className="hidden md:flex shrink-0">
        <button
          type="button"
          onClick={onCommandOpen}
          className={cn(
            "group flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 h-8",
            "text-[12.5px] text-faint",
            "hover:bg-surface-hover hover:border-border-strong hover:text-muted transition-colors",
            "min-w-[200px]"
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <Kbd size="sm">⌘K</Kbd>
        </button>
      </div>

      {/* Right: notifications + user menu */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Mobile search trigger */}
        <IconButton
          label="Search"
          size="sm"
          onClick={onCommandOpen}
          className="md:hidden"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </IconButton>

        <NotificationsPopover
          notifications={notifications}
          unreadCount={unreadCount}
          userId={userId}
        />

        <span className="h-5 w-px bg-border mx-1 hidden sm:block" aria-hidden="true" />

        <UserMenu
          name={userName}
          email={userEmail}
          roleLabel={userRoleLabel}
        />
      </div>
    </header>
  )
}
