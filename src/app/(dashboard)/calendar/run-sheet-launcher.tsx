"use client"

import { useState } from "react"
import { format } from "date-fns"
import { FileText, LayoutTemplate } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { createRunSheetForSlot } from "@/server/actions/events"

import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"

/**
 * Starting a run sheet for a service.
 *
 * Offered as a choice rather than going straight to a blank page, because most
 * services run the same shape every week and rebuilding that shape by hand is the
 * work the template feature exists to remove. A blank sheet stays the first option
 * for the service that genuinely is new.
 *
 * Skipped entirely when there are no templates yet — a one-option dialog is a click
 * that asks nothing.
 */

export function RunSheetLauncher({
  slot,
  templates,
  onClose,
  onCreated,
  onError
}: {
  slot: { id: string; label: string; slot_date: string; event_title: string }
  templates: { id: string; title: string }[]
  onClose: () => void
  onCreated: (runSheetId: string, existed: boolean) => void
  onError: (message: string) => void
}) {
  /** Null is the blank sheet — a real choice, not an absence of one. */
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const create = async () => {
    setSaving(true)
    const res = await createRunSheetForSlot(slot.id, {
      templateId: templateId ?? undefined
    })
    setSaving(false)

    if (res.error) return onError(res.error)
    if (res.id) onCreated(res.id, res.existed ?? false)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Start a run sheet"
      description={`${slot.event_title} — ${slot.label} · ${format(
        new Date(`${slot.slot_date}T12:00:00`),
        "EEEE d MMMM"
      )}`}
      size="default"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={create}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Choice
          icon={<FileText className="size-4" />}
          title="Blank sheet"
          detail="Build the running order from nothing."
          chosen={templateId === null}
          onChoose={() => setTemplateId(null)}
        />

        {templates.length > 0 && (
          <>
            <p className="pt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              From a template
            </p>
            {templates.map((t) => (
              <Choice
                key={t.id}
                icon={<LayoutTemplate className="size-4" />}
                title={t.title}
                detail="Sessions, cues and assignments, rebased onto this date."
                chosen={templateId === t.id}
                onChoose={() => setTemplateId(t.id)}
              />
            ))}
          </>
        )}
      </div>
    </Modal>
  )
}

function Choice({
  icon,
  title,
  detail,
  chosen,
  onChoose
}: {
  icon: React.ReactNode
  title: string
  detail: string
  chosen: boolean
  onChoose: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors duration-150",
        chosen
          ? "border-primary bg-[var(--color-primary-soft)]"
          : "border-border bg-surface hover:bg-surface-subtle"
      )}
    >
      <span className={cn("mt-0.5 shrink-0", chosen ? "text-primary" : "text-faint")}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">{detail}</span>
      </span>
    </button>
  )
}
