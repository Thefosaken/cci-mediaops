"use client"

import * as React from "react"
import { cn } from "@/lib/utils/cn"
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react"

export type ToastVariant = "success" | "error" | "warning" | "info"

export interface ToastItem {
  id: string
  variant: ToastVariant
  message: string
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

const variantStyles: Record<ToastVariant, string> = {
  success: "border-l-success",
  error: "border-l-danger",
  warning: "border-l-warning",
  info: "border-l-info",
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  React.useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration ?? 4000)
    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onDismiss])

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-border bg-surface-raised shadow-lg px-4 py-3",
        "border-l-[3px]",
        "animate-toast-in",
        variantStyles[toast.variant]
      )}
      style={{ maxWidth: "420px", minWidth: "280px" }}
    >
      {icons[toast.variant]}
      <p className="flex-1 text-sm text-foreground leading-snug">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={toast.action.onClick}
          className="shrink-0 text-xs font-semibold text-primary hover:underline"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 text-faint hover:text-foreground transition-colors"
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
