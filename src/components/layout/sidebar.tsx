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

const iconMap: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="h-4 w-4" />,
  Calendar: <Calendar className="h-4 w-4" />,
  Inbox: <Inbox className="h-4 w-4" />,
  CalendarCheck: <CalendarCheck className="h-4 w-4" />,
  ScrollText: <ScrollText className="h-4 w-4" />,
  Users: <Users className="h-4 w-4" />,
  Wrench: <Wrench className="h-4 w-4" />,
  ClipboardCheck: <ClipboardCheck className="h-4 w-4" />,
  AlertTriangle: <AlertTriangle className="h-4 w-4" />,
  BarChart3: <BarChart3 className="h-4 w-4" />,
  Settings: <Settings className="h-4 w-4" />,
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-surface">
      <div className="flex h-16 items-center justify-between border-b border-border px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white text-xs font-bold">
            C
          </div>
          <span className="text-[15px] font-semibold text-foreground">CCI MediaOps</span>
        </Link>
        {onClose && (
          <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:text-foreground hover:bg-surface-subtle">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150",
                isActive
                  ? "bg-primary text-white font-medium"
                  : "text-muted hover:text-foreground hover:bg-surface-subtle"
              )}
            >
              {iconMap[item.icon]}
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-border p-4">
        <p className="text-xs text-faint">CCI MediaOps v0.1</p>
      </div>
    </aside>
  )
}
