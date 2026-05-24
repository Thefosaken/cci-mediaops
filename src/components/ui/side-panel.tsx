"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils/cn"
import { X } from "lucide-react"

interface SidePanelProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: "sm" | "default" | "lg" | "xl"
  /** Optional content slot above the close button — chips, status, etc. */
  headerSlot?: React.ReactNode
}

/**
 * Right-side slide-over panel. The Linear/Vercel pattern for editing or
 * reviewing a record while keeping list context visible. Replaces modals
 * for most detail flows.
 */
export function SidePanel({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "default",
  headerSlot,
}: SidePanelProps) {
  const titleId = React.useId()
  const descId = React.useId()
  const panelRef = React.useRef<HTMLDivElement>(null)

  // Lock body scroll while open
  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Escape to close + focus mgmt
  React.useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    // Focus panel on open
    panelRef.current?.focus()
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (typeof window === "undefined") return null

  const widths = {
    sm: "max-w-[380px]",
    default: "max-w-[480px]",
    lg: "max-w-[600px]",
    xl: "max-w-[760px]",
  }[size]

  return createPortal(
    <div
      aria-hidden={!open}
      className={cn(
        "fixed inset-0 z-[80]",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/45 backdrop-blur-[2px]",
          "transition-opacity duration-300 ease-[var(--ease-out-quart)]",
          open ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "absolute top-0 right-0 h-dvh w-full bg-surface shadow-xl border-l border-border outline-none",
          "flex flex-col",
          "transition-transform duration-[420ms] ease-[var(--ease-out-expo)]",
          widths,
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border px-5 py-4 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id={titleId}
                className="text-[15px] font-semibold tracking-tight text-foreground leading-tight"
              >
                {title}
              </h2>
              {headerSlot}
            </div>
            {description && (
              <p id={descId} className="text-[13px] text-muted mt-0.5">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="shrink-0 -mr-1.5 -mt-0.5 rounded-md p-1.5 text-faint hover:text-foreground hover:bg-surface-subtle transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-subtle/40 px-5 py-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
