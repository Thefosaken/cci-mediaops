"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils/cn"

/**
 * Focus recipe for every interactive element in the view chrome.
 *
 * `globals.css` sets a 2px `--focus` outline as the app-wide default. In dark
 * mode `--focus` is `#F2645D` and `--danger` is `#FF6B62` — near-identical, so
 * a saturated outline on a dark popover is indistinguishable from a validation
 * error. We opt out and use a low-alpha ring, which reads as "focused" without
 * reading as "wrong".
 *
 * (The global rule now lives in `@layer base`, so plain `outline-none` wins.
 * It previously did not, and every caller needed `!important`.)
 */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30"

/**
 * Focus treatment for the search fields that own a whole row — the popover
 * headers and the toolbar's expanding search. Same reasoning as `focusRing`,
 * but a ring around a full-bleed header would be clipped by the popover's
 * `overflow-hidden`, so focus is a border shift plus a faint fill instead.
 *
 * State only, no `transition-*`: callers animate different properties, and
 * `tailwind-merge` collapses the whole transition group to the last one it sees.
 */
export const focusWithinField =
  "focus-within:border-border-strong focus-within:bg-surface-subtle/50"

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
  // 420px clears ~11 field rows plus a search header and a footer row without
  // scrolling, which is the routine case now that no field is hidden by default.
  maxHeight = 420,
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
      const gap = 8
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
        top: pos.openUpward ? undefined : pos.top + 8,
        bottom: pos.openUpward ? window.innerHeight - pos.top + 8 : undefined,
        left: pos.left,
        width,
        maxHeight: pos.maxHeight,
        zIndex: 100
      }}
      className={cn(
        // radius-lg (10px): a menu is a dropdown, not a modal — rounded-xl read
        // as a pill at these widths.
        "flex flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg outline-none",
        pos.openUpward ? "animate-slide-down origin-bottom" : "animate-slide-up origin-top",
        className
      )}
    >
      {children}
    </div>,
    document.body
  )
}

/**
 * Small uppercase section label used inside the view popovers.
 *
 * `px-3` (12px) rather than the rows' `px-2`, because rows sit inside a
 * `p-1` list — 4px + 8px puts their text at the same 12px optical inset.
 */
export function PopoverLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
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

/**
 * Menu row inside a view popover.
 *
 * 28px tall on desktop, 32px under `sm` where the row may be tapped — the
 * design system allows tighter spacing on dense operational surfaces, and 28px
 * is what keeps an 11-field list scannable in one view. Icons are 16px (§15
 * dense) with an 8px gap to the label.
 */
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
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] sm:h-7",
        "cursor-pointer select-none text-left transition-colors duration-100 ease-out",
        focusRing,
        "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
        tone === "danger"
          ? "text-danger hover:bg-danger-soft focus-visible:bg-danger-soft"
          : "text-foreground hover:bg-surface-subtle focus-visible:bg-surface-subtle",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {icon && (
        <span className={cn("flex shrink-0", tone === "danger" ? "" : "text-faint")}>{icon}</span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing && (
        <span className="shrink-0 text-[11px] tabular-nums text-faint">{trailing}</span>
      )}
    </button>
  )
}
