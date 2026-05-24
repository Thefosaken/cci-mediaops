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
  size?: "sm" | "default" | "lg"
  "aria-describedby"?: string
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "default",
  "aria-describedby": ariaDescribedby,
}: ModalProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const titleId = React.useId()
  const descId = React.useId()

  // Focus trap and escape
  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      dialog.showModal()
      // Prevent body scroll
      document.body.style.overflow = "hidden"
    } else {
      dialog.close()
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [open])

  // Close on backdrop click
  React.useEffect(() => {
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
    if (open) dialog.addEventListener("click", onClick)
    return () => dialog.removeEventListener("click", onClick)
  }, [open, onClose])

  // Close on Escape
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  const content = (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={ariaDescribedby ?? (description ? descId : undefined)}
      className={cn(
        "m-auto w-full rounded-2xl border border-border bg-surface p-0 shadow-lg",
        "backdrop:bg-black/50 backdrop:backdrop-blur-[2px]",
        "open:animate-scale-in",
        "[&:not([open])]:hidden",
        {
          "max-w-[400px]": size === "sm",
          "max-w-[540px]": size === "default",
          "max-w-[720px]": size === "lg",
        }
      )}
      style={{ maxHeight: "calc(100dvh - 48px)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[15px] font-semibold text-foreground leading-snug">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-0.5 text-sm text-muted">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="shrink-0 rounded-lg p-1.5 text-faint hover:text-foreground hover:bg-surface-subtle transition-colors duration-150 -mt-0.5 -mr-1"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Body */}
      <div className="overflow-y-auto px-6 py-5" style={{ maxHeight: "calc(100dvh - 200px)" }}>
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          {footer}
        </div>
      )}
    </dialog>
  )

  if (typeof window === "undefined") return null
  return createPortal(content, document.body)
}
