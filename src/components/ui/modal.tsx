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
  /** When true, the modal cannot be closed by clicking the backdrop or pressing Escape — use only for blocking confirmations. */
  blocking?: boolean
}

/**
 * Centered focus dialog. For long detail flows, prefer SidePanel.
 * Use this for: confirmations, focused single-purpose forms, destructive actions.
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
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const titleId = React.useId()
  const descId = React.useId()

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
      document.body.style.overflow = "hidden"
    } else {
      if (dialog.open) dialog.close()
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  // Backdrop click
  React.useEffect(() => {
    if (!open || blocking) return
    const dialog = dialogRef.current
    if (!dialog) return
    function onClick(e: MouseEvent) {
      const rect = dialog!.getBoundingClientRect()
      const outside =
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      if (outside) onClose()
    }
    dialog.addEventListener("click", onClick)
    return () => dialog.removeEventListener("click", onClick)
  }, [open, onClose, blocking])

  // Escape
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open && !blocking) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose, blocking])

  const content = (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cn(
        "m-auto w-full rounded-2xl border border-border bg-surface p-0 shadow-xl text-foreground",
        "open:animate-scale-in [&:not([open])]:hidden",
        {
          "max-w-[400px]": size === "sm",
          "max-w-[520px]": size === "default",
          "max-w-[680px]": size === "lg",
          "max-w-[860px]": size === "xl",
        }
      )}
      style={{ maxHeight: "calc(100dvh - 48px)" }}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[15px] font-semibold tracking-tight text-foreground leading-tight">
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

      <div
        className="overflow-y-auto px-5 py-3 border-t border-border"
        style={{ maxHeight: "calc(100dvh - 220px)" }}
      >
        {children}
      </div>

      {footer && (
        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-subtle/40 px-5 py-3 rounded-b-2xl">
          {footer}
        </div>
      )}
    </dialog>
  )

  if (typeof window === "undefined") return null
  return createPortal(content, document.body)
}
