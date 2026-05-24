"use client"

import React, { createContext, useCallback, useContext, useState } from "react"
import { ToastContainer } from "@/components/ui/toast"
import type { ToastItem, ToastVariant } from "@/components/ui/toast"

interface ToastContextValue {
  toast: (message: string, options?: Partial<Omit<ToastItem, "id" | "message">>) => void
  success: (message: string, action?: ToastItem["action"]) => void
  error: (message: string, action?: ToastItem["action"]) => void
  warning: (message: string, action?: ToastItem["action"]) => void
  info: (message: string, action?: ToastItem["action"]) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const add = useCallback(
    (
      message: string,
      variant: ToastVariant,
      action?: ToastItem["action"],
      duration?: number
    ) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => {
        const next = [...prev, { id, message, variant, action, duration }]
        // Max 3 toasts
        return next.length > 3 ? next.slice(next.length - 3) : next
      })
    },
    []
  )

  const ctx: ToastContextValue = {
    toast: (message, opts) => add(message, opts?.variant ?? "info", opts?.action, opts?.duration),
    success: (message, action) => add(message, "success", action),
    error: (message, action) => add(message, "error", action, 6000),
    warning: (message, action) => add(message, "warning", action),
    info: (message, action) => add(message, "info", action),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}
