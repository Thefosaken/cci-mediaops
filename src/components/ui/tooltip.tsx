"use client"

import * as React from "react"
import { cn } from "@/lib/utils/cn"

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  side?: "top" | "bottom" | "left" | "right"
  delay?: number
  className?: string
}

export function Tooltip({ content, children, side = "top", delay = 350, className }: TooltipProps) {
  const [open, setOpen] = React.useState(false)
  const [coords, setCoords] = React.useState<{ x: number; y: number } | null>(null)
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  function show() {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      let x = 0
      let y = 0
      if (side === "top") { x = r.left + r.width / 2; y = r.top - 8 }
      if (side === "bottom") { x = r.left + r.width / 2; y = r.bottom + 8 }
      if (side === "left") { x = r.left - 8; y = r.top + r.height / 2 }
      if (side === "right") { x = r.right + 8; y = r.top + r.height / 2 }
      setCoords({ x, y })
      setOpen(true)
    }, delay)
  }

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setOpen(false)
  }

  const child = React.cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node
      const ref = (children as unknown as { ref?: React.Ref<HTMLElement> }).ref
      if (typeof ref === "function") ref(node)
    },
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  } as Partial<React.HTMLAttributes<HTMLElement>> & { ref: React.Ref<HTMLElement> })

  return (
    <>
      {child}
      {open && coords && typeof document !== "undefined" && (
        <div
          role="tooltip"
          style={{
            position: "fixed",
            left: coords.x,
            top: coords.y,
            transform:
              side === "top" ? "translate(-50%, -100%)"
                : side === "bottom" ? "translate(-50%, 0)"
                : side === "left" ? "translate(-100%, -50%)"
                : "translate(0, -50%)",
            zIndex: 200,
          }}
          className={cn(
            "pointer-events-none rounded-md bg-[#0A0A0A] text-white px-2 py-1 text-[11.5px] font-medium",
            "shadow-md whitespace-nowrap animate-fade-in",
            "dark:bg-white dark:text-[#0A0A0A]",
            className
          )}
        >
          {content}
        </div>
      )}
    </>
  )
}
