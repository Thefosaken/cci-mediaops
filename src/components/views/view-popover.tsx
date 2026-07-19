"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils/cn"

interface ViewPopoverProps {
  open: boolean
  onClose: () => void
  /** The element the popover is anchored to. Focus returns here on close. */
  triggerRef: React.RefObject<HTMLElement | null>
  label: string
  align?: "start" | "end"
  width?: number
  maxHeight?: number
  children: React.ReactNode
  className?: string
}

interface Position {
  top: number
  left: number
  openUpward: boolean
  maxHeight: number
}

/**
 * Shared popover shell for the view chrome.
 *
 * Portals to `document.body` and positions itself against the trigger rect —
 * dashboard `<main>` regions are `overflow-y-auto`, so an absolutely positioned
 * popover would be clipped for any toolbar sitting inside one. Same pattern as
 * `src/components/ui/select.tsx`. Flips upward when there is no room below,
 * closes on Escape and outside click, and returns focus to its trigger.
 */
export function ViewPopover({
  open,
  onClose,
  triggerRef,
  label,
  align = "start",
  width = 280,
  maxHeight = 380,
  children,
  className
}: ViewPopoverProps) {
  const [mounted, setMounted] = React.useState(false)
  const [pos, setPos] = React.useState<Position | null>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => { setMounted(true) }, [])

  // Position against the trigger, tracking scroll/resize while open.
  React.useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    function compute() {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const gap = 6
      const edge = 8
      const spaceBelow = window.innerHeight - rect.bottom - gap - edge
      const spaceAbove = rect.top - gap - edge
      const openUpward = spaceBelow < maxHeight && spaceAbove > spaceBelow
      const available = openUpward ? spaceAbove : spaceBelow

      // Keep the panel inside the viewport horizontally — chips near the right
      // edge on mobile would otherwise push the panel off-screen.
      const raw = align === "end" ? rect.right - width : rect.left
      const left = Math.max(edge, Math.min(raw, window.innerWidth - width - edge))

      setPos({
        top: openUpward ? rect.top : rect.bottom,
        left,
        openUpward,
        maxHeight: Math.max(160, Math.min(maxHeight, available))
      })
    }
    compute()
    window.addEventListener("scroll", compute, true)
    window.addEventListener("resize", compute)
    return () => {
      window.removeEventListener("scroll", compute, true)
      window.removeEventListener("resize", compute)
    }
  }, [open, triggerRef, align, width, maxHeight])

  // Escape + outside click.
  React.useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (!target.isConnected) return
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      e.preventDefault()
      onClose()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, onClose, triggerRef])

  // Return focus to the trigger when the popover closes.
  React.useEffect(() => {
    if (!open) return
    return () => { triggerRef.current?.focus() }
  }, [open, triggerRef])

  if (!open || !mounted || !pos) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      style={{
        position: "fixed",
        top: pos.openUpward ? undefined : pos.top + 6,
        bottom: pos.openUpward ? window.innerHeight - pos.top + 6 : undefined,
        left: pos.left,
        width,
        maxHeight: pos.maxHeight,
        zIndex: 100
      }}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg outline-none",
        pos.openUpward ? "animate-slide-down origin-bottom" : "animate-slide-up origin-top",
        className
      )}
    >
      {children}
    </div>,
    document.body
  )
}

/** Small uppercase section label used inside the view popovers. */
export function PopoverLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
      {children}
    </div>
  )
}

export function PopoverSeparator() {
  return <div className="my-1 h-px bg-border" role="separator" />
}

interface PopoverRowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode
  trailing?: React.ReactNode
  tone?: "default" | "danger"
}

/** Menu row inside a view popover — matches DropdownMenuItem's rhythm. */
export function PopoverRow({
  icon,
  trailing,
  tone = "default",
  className,
  children,
  ...props
}: PopoverRowProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] cursor-pointer select-none text-left",
        "outline-none transition-colors duration-100",
        "focus-visible:ring-2 focus-visible:ring-focus-ring/30",
        "[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0",
        tone === "danger"
          ? "text-danger hover:bg-danger-soft focus-visible:bg-danger-soft"
          : "text-foreground hover:bg-surface-subtle focus-visible:bg-surface-subtle",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {icon && <span className={tone === "danger" ? "" : "text-faint"}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing && <span className="shrink-0 text-faint">{trailing}</span>}
    </button>
  )
}
