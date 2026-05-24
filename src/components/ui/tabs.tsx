"use client"

import * as React from "react"
import { cn } from "@/lib/utils/cn"

interface TabsContextValue {
  value: string
  onChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  className?: string
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onChange: onValueChange }}>
      <div className={cn("flex flex-col", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

interface TabsListProps {
  children: React.ReactNode
  className?: string
  variant?: "underline" | "pill"
}

export function TabsList({ children, className, variant = "underline" }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={cn(
        variant === "underline"
          ? "flex items-center gap-4 border-b border-border"
          : "inline-flex items-center gap-0.5 rounded-md bg-surface-subtle p-0.5 border border-border",
        className
      )}
      data-variant={variant}
    >
      {children}
    </div>
  )
}

interface TabsTriggerProps {
  value: string
  children: React.ReactNode
  className?: string
  badge?: React.ReactNode
  disabled?: boolean
}

export function TabsTrigger({ value, children, className, badge, disabled }: TabsTriggerProps) {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error("TabsTrigger must be inside Tabs")
  const active = ctx.value === value
  // Detect variant from parent via DOM (simple — both variants render similar trigger but different styles)
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={() => ctx.onChange(value)}
      className={cn(
        "group relative inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors duration-150 cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40 focus-visible:rounded",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        // Underline variant default
        "px-1 py-2.5 -mb-px",
        active ? "text-foreground" : "text-muted hover:text-foreground",
        className
      )}
      data-active={active}
    >
      {children}
      {badge && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-surface-subtle text-faint text-[10px] font-semibold px-1.5">
          {badge}
        </span>
      )}
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 -bottom-px h-[2px] bg-foreground rounded-full"
        />
      )}
    </button>
  )
}

interface TabsContentProps {
  value: string
  children: React.ReactNode
  className?: string
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error("TabsContent must be inside Tabs")
  if (ctx.value !== value) return null
  return (
    <div role="tabpanel" className={cn("animate-fade-in", className)}>
      {children}
    </div>
  )
}
