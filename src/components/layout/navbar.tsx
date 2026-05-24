"use client"

import { Bell, LogOut, Menu, Moon, Sun, ChevronRight } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useTheme } from "@/lib/theme/theme-context"
import { usePathname } from "next/navigation"
import { NAV_ITEMS } from "@/constants"
import { cn } from "@/lib/utils/cn"

interface NavbarProps {
  onMenuClick?: () => void
  title?: string
}

// User initials avatar
function Avatar({ name }: { name?: string }) {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?"
  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary text-xs font-bold ring-1 ring-border select-none"
      title={name ?? "User"}
      aria-label={name ?? "User avatar"}
    >
      {initials}
    </div>
  )
}

// Breadcrumb derived from current path
function Breadcrumb({ pathname }: { pathname: string }) {
  const current = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  )
  if (!current) return null
  return (
    <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-sm">
      <span className="text-faint text-xs">CCI</span>
      <ChevronRight className="h-3 w-3 text-faint" aria-hidden="true" />
      <span className="font-medium text-foreground">{current.label}</span>
    </nav>
  )
}

export function Navbar({ onMenuClick, title }: NavbarProps) {
  const { resolvedTheme, toggle } = useTheme()
  const pathname = usePathname()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-4 lg:px-6 shrink-0">
      {/* Left: hamburger + breadcrumb */}
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="rounded-lg p-2 text-muted hover:text-foreground hover:bg-surface-subtle lg:hidden transition-colors duration-150"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        {title ? (
          <h1 className="text-[15px] font-semibold text-foreground hidden sm:block">{title}</h1>
        ) : (
          <Breadcrumb pathname={pathname} />
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center">
        {/* Internal badge */}
        <span className="hidden sm:inline-flex items-center rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[10px] font-semibold text-faint tracking-wide uppercase mr-3">
          Internal
        </span>

        {/* Divider */}
        <div className="h-5 w-px bg-border mx-1 hidden sm:block" aria-hidden="true" />

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="rounded-lg p-2 text-muted hover:text-foreground hover:bg-surface-subtle transition-colors duration-150"
          aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
        >
          {resolvedTheme === "dark" ? (
            <Sun className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        {/* Notifications */}
        <button
          className="relative rounded-lg p-2 text-muted hover:text-foreground hover:bg-surface-subtle transition-colors duration-150"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          <span
            className={cn(
              "absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary",
              "animate-pulse-dot"
            )}
            aria-hidden="true"
          />
        </button>

        {/* Divider */}
        <div className="h-5 w-px bg-border mx-2" aria-hidden="true" />

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="rounded-lg p-2 text-muted hover:text-foreground hover:bg-surface-subtle transition-colors duration-150"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Avatar */}
        <div className="ml-2">
          <Avatar />
        </div>
      </div>
    </header>
  )
}
