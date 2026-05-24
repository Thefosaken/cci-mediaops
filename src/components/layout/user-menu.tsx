"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronDown, LogOut, Moon, Sun, Settings, User as UserIcon, Monitor } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { Avatar } from "@/components/ui/avatar"
import { Kbd } from "@/components/ui/kbd"
import { useTheme } from "@/lib/theme/theme-context"
import { createClient } from "@/lib/supabase/client"

interface UserMenuProps {
  name: string | null
  email: string | null
  roleLabel?: string | null
  compact?: boolean
}

export function UserMenu({ name, email, roleLabel, compact }: UserMenuProps) {
  const [open, setOpen] = React.useState(false)
  const { theme, setTheme, resolvedTheme } = useTheme()
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-2 rounded-md py-1 transition-colors cursor-pointer",
          "hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          compact ? "px-1" : "px-1.5"
        )}
      >
        <Avatar name={name} email={email} size="sm" />
        {!compact && (
          <>
            <div className="text-left min-w-0">
              <div className="text-[12.5px] font-medium text-foreground truncate max-w-[140px]">
                {name ?? email ?? "User"}
              </div>
              {roleLabel && (
                <div className="text-[10.5px] text-faint truncate">{roleLabel}</div>
              )}
            </div>
            <ChevronDown className="h-3 w-3 text-faint shrink-0" aria-hidden="true" />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 bottom-full mb-2 w-[260px] z-50",
            "rounded-xl border border-border bg-surface-raised shadow-lg",
            "animate-scale-in origin-bottom-right overflow-hidden"
          )}
        >
          {/* Identity */}
          <div className="flex items-center gap-3 px-3 py-3 border-b border-border">
            <Avatar name={name} email={email} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-foreground truncate">
                {name ?? "User"}
              </div>
              <div className="text-[11.5px] text-faint truncate">{email}</div>
              {roleLabel && (
                <div className="text-[10.5px] font-medium text-muted uppercase tracking-wider mt-0.5">
                  {roleLabel}
                </div>
              )}
            </div>
          </div>

          {/* Account actions */}
          <div className="p-1">
            <MenuLink href="/settings" icon={<UserIcon />} onClick={() => setOpen(false)}>
              Profile
            </MenuLink>
            <MenuLink href="/settings" icon={<Settings />} onClick={() => setOpen(false)} shortcut={<Kbd size="sm">,</Kbd>}>
              Settings
            </MenuLink>
          </div>

          {/* Theme */}
          <div className="border-t border-border px-3 py-2.5">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-faint mb-1.5">
              Theme
            </div>
            <div className="inline-flex w-full items-center rounded-md bg-surface-subtle p-0.5 border border-border">
              <ThemeOption
                active={theme === "light"}
                onClick={() => setTheme("light")}
                icon={<Sun className="h-3 w-3" />}
                label="Light"
              />
              <ThemeOption
                active={theme === "dark"}
                onClick={() => setTheme("dark")}
                icon={<Moon className="h-3 w-3" />}
                label="Dark"
              />
              <ThemeOption
                active={theme === "system"}
                onClick={() => setTheme("system")}
                icon={<Monitor className="h-3 w-3" />}
                label="System"
              />
            </div>
            <p className="text-[10.5px] text-faint mt-1.5">
              Currently {resolvedTheme} mode
            </p>
          </div>

          {/* Sign out */}
          <div className="p-1 border-t border-border">
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-foreground hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
              <span className="flex-1 text-left">Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuLink({
  href,
  icon,
  children,
  onClick,
  shortcut,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
  onClick?: () => void
  shortcut?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-foreground hover:bg-surface-subtle transition-colors"
    >
      <span className="text-faint [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      <span className="flex-1 text-left">{children}</span>
      {shortcut && <span className="text-faint">{shortcut}</span>}
    </Link>
  )
}

function ThemeOption({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-[5px] py-1 text-[11.5px] font-medium transition-colors cursor-pointer",
        active
          ? "bg-surface text-foreground shadow-sm border border-border"
          : "text-muted hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  )
}
