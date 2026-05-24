"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, ArrowRight, X as XIcon, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { Button, IconButton } from "@/components/ui/button"
import { markUserOnboarded } from "@/server/actions/join-requests"

export interface ChecklistItem {
  id: string
  label: string
  description: string
  href: string
  done: boolean
}

interface GettingStartedProps {
  items: ChecklistItem[]
}

/**
 * Dismissible "Get started" card on the dashboard. Shown to users until
 * either (a) they dismiss it, or (b) every item is done.
 *
 * Each item links into the part of the app where it can be completed —
 * we don't try to inline the work here. The card just orients.
 */
export function GettingStarted({ items }: GettingStartedProps) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null

  const completed = items.filter((i) => i.done).length
  const total = items.length
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)

  async function dismiss() {
    setHidden(true)
    void markUserOnboarded()
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border bg-gradient-to-br from-primary-soft/40 to-transparent">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface border border-border text-primary">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-[14px] font-semibold tracking-tight text-foreground">
              Get started
            </h2>
            <p className="text-[12px] text-muted mt-0.5">
              {completed === total
                ? "You're all set."
                : `${completed} of ${total} complete · ${pct}%`}
            </p>
          </div>
        </div>
        <IconButton label="Dismiss" size="xs" onClick={dismiss}>
          <XIcon className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      {/* Progress strip */}
      <div className="h-[3px] bg-surface-subtle">
        <div
          className="h-full bg-primary transition-all duration-500 ease-[var(--ease-out-expo)]"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="group flex items-center gap-3 px-5 py-3 hover:bg-surface-hover transition-colors"
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  item.done
                    ? "bg-success border-success text-white"
                    : "border-border-strong text-faint group-hover:border-foreground"
                )}
              >
                {item.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-[13px] font-medium leading-tight",
                  item.done ? "text-muted line-through decoration-1" : "text-foreground"
                )}>
                  {item.label}
                </p>
                <p className="text-[12px] text-faint mt-0.5">{item.description}</p>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-faint group-hover:text-foreground transition-colors shrink-0" />
            </Link>
          </li>
        ))}
      </ul>

      {completed === total && (
        <div className="px-5 py-3 border-t border-border bg-surface-subtle/40">
          <Button size="xs" variant="ghost" onClick={dismiss}>
            Hide this card
          </Button>
        </div>
      )}
    </div>
  )
}
