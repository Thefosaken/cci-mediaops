"use client"

import * as React from "react"
import Link from "next/link"
import { Bell, Check, CheckCheck } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { IconButton } from "@/components/ui/button"
import { StatusDot } from "@/components/ui/badge"
import { markNotificationRead, markAllNotificationsRead } from "@/server/actions/notifications"
import type { ShellNotification } from "@/server/queries/shell"
import { formatDistanceToNow } from "date-fns"

interface NotificationsPopoverProps {
  notifications: ShellNotification[]
  unreadCount: number
  userId: string | null
}

const ENTITY_HREFS: Record<string, string> = {
  request: "/requests",
  task: "/scheduling",
  equipment: "/equipment",
  incident: "/incidents",
  event: "/calendar",
}

export function NotificationsPopover({
  notifications,
  unreadCount,
  userId,
}: NotificationsPopoverProps) {
  const [open, setOpen] = React.useState(false)
  const [optimistic, setOptimistic] = React.useState<Set<string>>(new Set())
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

  const visibleUnread = unreadCount - optimistic.size

  async function markOne(id: string) {
    setOptimistic((prev) => new Set(prev).add(id))
    await markNotificationRead(id)
  }

  async function markAll() {
    if (!userId) return
    setOptimistic((prev) => {
      const next = new Set(prev)
      notifications.forEach((n) => { if (!n.read_at) next.add(n.id) })
      return next
    })
    await markAllNotificationsRead(userId)
  }

  return (
    <div ref={containerRef} className="relative">
      <IconButton
        label={visibleUnread > 0 ? `Notifications (${visibleUnread} unread)` : "Notifications"}
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className="relative"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {visibleUnread > 0 && (
          <span className="absolute top-1 right-1">
            <StatusDot variant="default" pulse />
          </span>
        )}
      </IconButton>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-full mt-2 w-[380px] z-50",
            "rounded-xl border border-border bg-surface-raised shadow-lg",
            "animate-scale-in origin-top-right overflow-hidden"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <h3 className="text-[13.5px] font-semibold text-foreground">Notifications</h3>
              <p className="text-[11.5px] text-faint">
                {visibleUnread > 0
                  ? `${visibleUnread} unread`
                  : "You're all caught up"}
              </p>
            </div>
            {visibleUnread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="flex items-center gap-1 text-[11.5px] font-medium text-muted hover:text-foreground transition-colors"
              >
                <CheckCheck className="h-3 w-3" aria-hidden="true" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-10 w-10 rounded-full bg-surface-subtle flex items-center justify-center mb-3">
                  <Bell className="h-4 w-4 text-faint" />
                </div>
                <p className="text-[13px] font-medium text-foreground">No notifications</p>
                <p className="text-[12px] text-faint mt-1 max-w-[260px]">
                  Updates from your sub-teams and assignments will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((n) => {
                  const isRead = n.read_at !== null || optimistic.has(n.id)
                  const href =
                    n.entity_type && n.entity_id && ENTITY_HREFS[n.entity_type]
                      ? `${ENTITY_HREFS[n.entity_type]}?id=${n.entity_id}`
                      : null
                  const Content = (
                    <>
                      <div className="flex items-start gap-3 px-4 py-3">
                        <span className="mt-1.5 shrink-0">
                          <StatusDot variant={isRead ? "muted" : "default"} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-[13px] leading-snug", isRead ? "text-muted" : "text-foreground font-medium")}>
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-[12px] text-faint leading-snug mt-0.5 line-clamp-2">{n.body}</p>
                          )}
                          <p className="text-[11px] text-faint mt-1">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        {!isRead && (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); markOne(n.id) }}
                            aria-label="Mark as read"
                            className="shrink-0 -mr-1 rounded p-1 text-faint hover:text-foreground hover:bg-surface-subtle transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Check className="h-3 w-3" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </>
                  )
                  return (
                    <li key={n.id} className="group">
                      {href ? (
                        <Link
                          href={href}
                          onClick={() => { setOpen(false); if (!isRead) markOne(n.id) }}
                          className="block hover:bg-surface-subtle transition-colors"
                        >
                          {Content}
                        </Link>
                      ) : (
                        <div className="hover:bg-surface-subtle transition-colors">{Content}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border px-4 py-2.5 text-center">
              <Link
                href="/settings#notifications"
                onClick={() => setOpen(false)}
                className="text-[12px] font-medium text-muted hover:text-foreground transition-colors"
              >
                Notification settings →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
