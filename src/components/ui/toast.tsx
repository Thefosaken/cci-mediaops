"use client"

import * as React from "react"
import { cn } from "@/lib/utils/cn"
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react"

export type ToastVariant = "success" | "error" | "warning" | "info"

export interface ToastItem {
  id: string
  variant: ToastVariant
  message: string
  description?: string
  action?: { label: string; onClick: () => void }
  duration?: number
}

interface ToastProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

const icons: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden="true" />,
  error: <XCircle className="h-4 w-4 text-danger shrink-0" aria-hidden="true" />,
  warning: <AlertTriangle className="h-4 w-4 text-warning shrink-0" aria-hidden="true" />,
  info: <Info className="h-4 w-4 text-info shrink-0" aria-hidden="true" />,
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  React.useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration ?? 4500)
    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-border bg-surface-raised shadow-lg",
        "px-3.5 py-3 animate-toast-in"
      )}
      style={{ maxWidth: "380px", minWidth: "280px" }}
    >
      {icons[toast.variant]}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground leading-snug">{toast.message}</p>
        {toast.description && (
          <p className="text-[12px] text-muted leading-snug mt-0.5">{toast.description}</p>
        )}
      </div>
      {toast.action && (
        <button
          type="button"
          onClick={toast.action.onClick}
          className="shrink-0 text-[12px] font-semibold text-primary hover:underline underline-offset-2"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="shrink-0 -mr-1 -mt-0.5 rounded p-0.5 text-faint hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

export function ToastContainer({ toasts, onDismiss }: ToastProps) {
  return (
    <div
      className={cn(
        "fixed z-[100] flex flex-col gap-2 pointer-events-none",
        "bottom-4 right-4 items-end",
        "sm:bottom-5 sm:right-5"
      )}
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  )
}
