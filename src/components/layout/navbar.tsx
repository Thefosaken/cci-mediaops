"use client"

import { Bell, LogOut, User, Menu, Moon, Sun } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useTheme } from "@/lib/theme/theme-context"
import { cn } from "@/lib/utils/cn"

interface NavbarProps {
  onMenuClick?: () => void
  title?: string
}

export function Navbar({ onMenuClick, title }: NavbarProps) {
  const { resolvedTheme, toggle } = useTheme()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-4 lg:px-6">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="rounded-lg p-2 text-muted hover:text-foreground hover:bg-surface-subtle lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        {title && (
          <h1 className="text-lg font-semibold text-foreground hidden sm:block">{title}</h1>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={toggle}
          className="rounded-lg p-2 text-muted hover:text-foreground hover:bg-surface-subtle transition-colors duration-150"
          aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
        >
          {resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <button className="relative rounded-lg p-2 text-muted hover:text-foreground hover:bg-surface-subtle transition-colors duration-150">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
        </button>
        <button
          onClick={handleSignOut}
          className="rounded-lg p-2 text-muted hover:text-foreground hover:bg-surface-subtle transition-colors duration-150"
          aria-label="Sign out"
        >
          <LogOut className="h-5 w-5" />
        </button>
        <div className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-surface-subtle text-muted ring-1 ring-border">
          <User className="h-4 w-4" />
        </div>
      </div>
    </header>
  )
}
