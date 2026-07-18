"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils/cn"
import {
  Search,
  ArrowRight,
  Plus,
  Inbox,
  Calendar,
  CalendarCheck,
  ScrollText,
  Users,
  Wrench,
  ClipboardCheck,
  AlertTriangle,
  BarChart3,
  Settings,
  LayoutDashboard,
  Moon,
  Sun,
  LogOut,
} from "lucide-react"
import { Kbd } from "@/components/ui/kbd"
import { useTheme } from "@/lib/theme/theme-context"
import { createClient } from "@/lib/supabase/client"

interface CommandItem {
  id: string
  label: string
  hint?: string
  icon: React.ReactNode
  group: "Navigation" | "Create" | "Actions" | "Theme"
  keywords?: string[]
  shortcut?: string
  perform: () => void | Promise<void>
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [query, setQuery] = React.useState("")
  const [activeIndex, setActiveIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const go = React.useCallback(
    (href: string) => {
      router.push(href)
      onClose()
    },
    [router, onClose]
  )

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const items: CommandItem[] = React.useMemo(
    () => [
      // Navigation
      { id: "nav-dashboard", label: "Go to Dashboard", icon: <LayoutDashboard />, group: "Navigation", keywords: ["home", "overview"], perform: () => go("/dashboard") },
      { id: "nav-calendar", label: "Go to Calendar", icon: <Calendar />, group: "Navigation", keywords: ["events", "schedule"], perform: () => go("/calendar") },
      { id: "nav-requests", label: "Go to Requests", icon: <Inbox />, group: "Navigation", keywords: ["inbox", "media", "task"], perform: () => go("/requests") },
      { id: "nav-runsheets", label: "Go to Run Sheets", icon: <ScrollText />, group: "Navigation", keywords: ["cue", "service"], perform: () => go("/run-sheets") },
      { id: "nav-subteams", label: "Go to Sub-Teams", icon: <Users />, group: "Navigation", keywords: ["teams", "members"], perform: () => go("/sub-teams") },
      { id: "nav-equipment", label: "Go to Equipment", icon: <Wrench />, group: "Navigation", keywords: ["inventory", "gear"], perform: () => go("/equipment") },
      { id: "nav-approvals", label: "Go to Approvals", icon: <ClipboardCheck />, group: "Navigation", keywords: ["review"], perform: () => go("/approvals") },
      { id: "nav-incidents", label: "Go to Incidents", icon: <AlertTriangle />, group: "Navigation", keywords: ["issues", "problem"], perform: () => go("/incidents") },
      { id: "nav-reports", label: "Go to Reports", icon: <BarChart3 />, group: "Navigation", keywords: ["analytics", "stats"], perform: () => go("/reports") },
      { id: "nav-settings", label: "Go to Settings", icon: <Settings />, group: "Navigation", keywords: ["admin", "campus", "preferences"], perform: () => go("/settings") },

      // Create
      { id: "new-event", label: "Create event", hint: "Schedule a service or programme", icon: <Plus />, group: "Create", keywords: ["service", "sunday"], perform: () => go("/calendar?new=1") },
      { id: "new-request", label: "Create request", hint: "Submit a new media request", icon: <Plus />, group: "Create", keywords: ["design", "video", "photo"], perform: () => go("/requests?new=1") },
      { id: "new-runsheet", label: "Create run sheet", hint: "Build a service flow", icon: <Plus />, group: "Create", perform: () => go("/run-sheets?new=1") },
      { id: "new-equipment", label: "Add equipment", hint: "Register a new item", icon: <Plus />, group: "Create", perform: () => go("/equipment?new=1") },
      { id: "new-incident", label: "Report incident", hint: "Log a service issue", icon: <Plus />, group: "Create", perform: () => go("/incidents?new=1") },

      // Theme
      {
        id: "theme-light",
        label: "Switch to light mode",
        icon: <Sun />,
        group: "Theme",
        keywords: ["light", "white"],
        perform: () => { setTheme("light"); onClose() },
      },
      {
        id: "theme-dark",
        label: "Switch to dark mode",
        icon: <Moon />,
        group: "Theme",
        keywords: ["dark", "night"],
        perform: () => { setTheme("dark"); onClose() },
      },

      // Actions
      {
        id: "action-signout",
        label: "Sign out",
        icon: <LogOut />,
        group: "Actions",
        keywords: ["logout", "exit"],
        perform: signOut,
      },
    ],
    [go, setTheme, onClose]
  )

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const haystack = [item.label, item.hint ?? "", ...(item.keywords ?? [])].join(" ").toLowerCase()
      return haystack.includes(q)
    })
  }, [items, query])

  const grouped = React.useMemo(() => {
    const groups: Record<string, CommandItem[]> = {}
    filtered.forEach((item) => {
      ;(groups[item.group] ??= []).push(item)
    })
    return groups
  }, [filtered])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Lock body scroll while open
  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [open])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      filtered[activeIndex]?.perform()
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  // Scroll active item into view
  React.useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  if (typeof window === "undefined" || !open) return null

  let runningIndex = -1

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 sm:pt-[15vh]">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[3px] animate-fade-in"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={handleKey}
        className={cn(
          "relative w-full max-w-[600px] overflow-hidden rounded-xl",
          "border border-border bg-surface-raised shadow-xl",
          "animate-scale-in origin-top"
        )}
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-faint shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, page, or search…"
            className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-faint focus:outline-none"
          />
          <Kbd size="sm">esc</Kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[420px] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-faint">
              No matches for &ldquo;<span className="text-foreground">{query}</span>&rdquo;
            </div>
          ) : (
            Object.entries(grouped).map(([group, groupItems]) => (
              <div key={group} className="px-2 pb-1">
                <div className="px-2 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
                  {group}
                </div>
                {groupItems.map((item) => {
                  runningIndex += 1
                  const idx = runningIndex
                  const active = idx === activeIndex
                  // Skip dark/light item if it's already current
                  if (
                    (item.id === "theme-dark" && resolvedTheme === "dark") ||
                    (item.id === "theme-light" && resolvedTheme === "light")
                  ) {
                    runningIndex -= 1
                    return null
                  }
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      data-index={idx}
                      aria-selected={active}
                      onClick={() => item.perform()}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left cursor-pointer",
                        "transition-colors duration-75",
                        active ? "bg-surface-subtle text-foreground" : "text-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-faint",
                          active && "text-foreground border-border-strong"
                        )}
                      >
                        {React.cloneElement(item.icon as React.ReactElement<{ className?: string }>, { className: "h-3.5 w-3.5" })}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-medium text-foreground truncate">
                          {item.label}
                        </span>
                        {item.hint && (
                          <span className="block text-[12px] text-faint truncate">{item.hint}</span>
                        )}
                      </span>
                      {active && <ArrowRight className="h-3.5 w-3.5 text-faint shrink-0" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11.5px] text-faint">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Kbd size="sm">↑</Kbd>
              <Kbd size="sm">↓</Kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd size="sm">↵</Kbd>
              select
            </span>
          </div>
          <span>CCI MediaOps</span>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** Global ⌘K hook — registers listener to open palette. */
export function useCommandPaletteShortcut(onOpen: () => void) {
  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        onOpen()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onOpen])
}
