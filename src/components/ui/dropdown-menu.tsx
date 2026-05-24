"use client"

import * as React from "react"
import { cn } from "@/lib/utils/cn"

interface DropdownMenuProps {
  trigger: React.ReactElement
  children: React.ReactNode
  align?: "start" | "end"
  className?: string
}

const DropdownContext = React.createContext<{ close: () => void } | null>(null)

export function DropdownMenu({ trigger, children, align = "end", className }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const close = React.useCallback(() => setOpen(false), [])

  React.useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) close()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, close])

  const wrappedTrigger = React.cloneElement(trigger, {
    onClick: (e: React.MouseEvent) => {
      const original = (trigger.props as { onClick?: (e: React.MouseEvent) => void }).onClick
      original?.(e)
      setOpen((o) => !o)
    },
    "aria-expanded": open,
    "aria-haspopup": "menu",
  } as Partial<React.HTMLAttributes<HTMLElement>>)

  return (
    <div ref={containerRef} className="relative inline-block">
      {wrappedTrigger}
      {open && (
        <DropdownContext.Provider value={{ close }}>
          <div
            role="menu"
            className={cn(
              "absolute top-full mt-1.5 z-50 min-w-[200px]",
              "rounded-lg border border-border bg-surface-raised shadow-lg p-1",
              "animate-scale-in origin-top",
              align === "end" ? "right-0" : "left-0",
              className
            )}
          >
            {children}
          </div>
        </DropdownContext.Provider>
      )}
    </div>
  )
}

interface MenuItemProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  onSelect?: () => void
  variant?: "default" | "danger"
  icon?: React.ReactNode
  shortcut?: React.ReactNode
}

export function DropdownMenuItem({
  className,
  onSelect,
  variant = "default",
  icon,
  shortcut,
  children,
  ...props
}: MenuItemProps) {
  const ctx = React.useContext(DropdownContext)
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onSelect?.()
        ctx?.close()
      }}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] cursor-pointer select-none",
        "transition-colors duration-100 outline-none",
        "[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0",
        variant === "danger"
          ? "text-danger hover:bg-danger-soft focus:bg-danger-soft"
          : "text-foreground hover:bg-surface-subtle focus:bg-surface-subtle",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {icon && <span className="text-faint">{icon}</span>}
      <span className="flex-1 text-left truncate">{children}</span>
      {shortcut && <span className="text-faint">{shortcut}</span>}
    </button>
  )
}

export function DropdownMenuSeparator() {
  return <div className="h-px bg-border my-1 -mx-1" role="separator" />
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
      {children}
    </div>
  )
}
