"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils/cn"
import { X } from "lucide-react"

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: "sm" | "default" | "lg" | "xl"
  /** When true, the modal cannot be closed by clicking the backdrop or pressing Escape. */
  blocking?: boolean
}

/**
 * Centered focus dialog (portal-based, not native <dialog>).
 *
 * Native <dialog> + the form Selects we use don't play well together — the
 * dropdowns get clipped by the dialog's stacking/overflow rules. Using a
 * portal-rendered div lets popovers inside the form (Selects, Comboboxes,
 * date pickers) appear correctly above everything else.
 *
 * For long detail flows, prefer SidePanel. Use this for: confirmations,
 * focused single-purpose forms, destructive actions.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "default",
  blocking = false,
}: ModalProps) {
  const titleId = React.useId()
  const descId = React.useId()
  const panelRef = React.useRef<HTMLDivElement>(null)

  // Lock body scroll while any modal is open
  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Escape to close + initial focus
  React.useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !blocking) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    // Move focus into the panel
    panelRef.current?.focus()
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose, blocking])

  if (typeof window === "undefined") return null

  const maxWidth = {
    sm: "max-w-[400px]",
    default: "max-w-[520px]",
    lg: "max-w-[680px]",
    xl: "max-w-[860px]",
  }[size]

  return createPortal(
    <div
      aria-hidden={!open}
      className={cn(
        "fixed inset-0 z-[90]",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      {/* Backdrop */}
      <div
        onClick={blocking ? undefined : onClose}
        className={cn(
          "absolute inset-0 bg-black/55 backdrop-blur-[3px]",
          "transition-opacity duration-200 ease-[var(--ease-out-quart)]",
          open ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Centered scroll container — the modal scrolls in the page, so dropdowns
          inside can extend naturally without being clipped by an inner overflow. */}
      <div
        className={cn(
          "absolute inset-0 overflow-y-auto",
          "flex items-start sm:items-center justify-center",
          "p-4 sm:p-6",
          "transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "relative w-full bg-surface text-foreground rounded-2xl border border-border shadow-xl outline-none",
            "animate-scale-in",
            maxWidth
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-[15px] font-semibold tracking-tight text-foreground leading-tight"
              >
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-[13px] text-muted leading-snug">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="shrink-0 -mr-1 rounded-md p-1.5 text-faint hover:text-foreground hover:bg-surface-subtle transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Body — visible overflow so dropdowns can escape */}
          <div className="px-5 py-3 border-t border-border">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-subtle/40 px-5 py-3 rounded-b-2xl">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
