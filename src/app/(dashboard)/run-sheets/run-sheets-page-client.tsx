"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import { ScrollText, Plus, CalendarRange, LayoutTemplate } from "lucide-react"

import { useToast } from "@/lib/toast/toast-context"
import { useUrlState } from "@/lib/hooks/use-url-state"
import { createStandaloneRunSheet, createFromTemplate } from "@/server/actions/run-sheets/templates"

import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/form-field"

/**
 * Run sheet index.
 *
 * The timeline at /run-sheets/[id] is the detail view — this page only lists sheets and
 * templates and creates new ones. The old inline segment editor and live mode moved
 * there when run_sheet_segments was retired.
 */

interface RunSheet {
  id: string
  title: string
  status: string
  sheet_date: string | null
  events: { id: string; title: string; start_time: string } | null
  run_sheet_sessions: { id: string }[]
}

interface RunSheetTemplate {
  id: string
  title: string
  run_sheet_sessions: { id: string }[]
}

export function RunSheetsPageClient({
  runSheets,
  events,
  templates,
}: {
  runSheets: RunSheet[]
  events: { id: string; title: string; start_time: string }[]
  templates: RunSheetTemplate[]
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const { get, clear } = useUrlState()

  const [showNew, setShowNew] = useState(get("new") === "1")
  const [useTemplate, setUseTemplate] = useState<RunSheetTemplate | null>(null)

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Run sheets"
        description="Plan service flow on a timeline and run it live"
        icon={<ScrollText />}
        actions={
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-3.5 w-3.5" /> New run sheet
          </Button>
        }
      />

      <div className="px-5 py-6 sm:px-6 space-y-6">
        {/* Templates */}
        {templates.length > 0 && (
          <section className="rounded-lg border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <LayoutTemplate className="size-4 text-muted" />
              <h2 className="text-[13px] font-medium text-foreground">Templates</h2>
              <p className="text-[12px] text-muted ml-1">
                Start a new sheet from a saved structure.
              </p>
            </div>
            <ul className="divide-y divide-border">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex-1 truncate text-[13px] text-foreground">{t.title}</span>
                  <span className="text-[12px] text-muted">
                    {t.run_sheet_sessions?.length ?? 0} session
                    {(t.run_sheet_sessions?.length ?? 0) === 1 ? "" : "s"}
                  </span>
                  <Button size="xs" variant="outline" onClick={() => setUseTemplate(t)}>
                    Use
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Sheets */}
        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-medium text-foreground">All run sheets</h2>
          </div>

          {runSheets.length === 0 ? (
            <div className="p-6">
              <EmptyState
                variant="compact"
                icon={<ScrollText />}
                title="No run sheets yet"
                description="Create your first one to start planning service flow."
                action={{ label: "New run sheet", onClick: () => setShowNew(true) }}
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {runSheets.map((rs) => (
                <li key={rs.id}>
                  <Link
                    href={`/run-sheets/${rs.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-subtle/60 transition-colors"
                  >
                    <CalendarRange className="size-4 text-muted shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-foreground truncate">{rs.title}</p>
                      <p className="text-[11.5px] text-muted truncate mt-0.5">
                        {rs.events?.title ??
                          (rs.sheet_date
                            ? format(new Date(rs.sheet_date), "EEE, MMM d yyyy")
                            : "Standalone")}
                        {" · "}
                        {rs.run_sheet_sessions?.length ?? 0} session
                        {(rs.run_sheet_sessions?.length ?? 0) === 1 ? "" : "s"}
                      </p>
                    </div>
                    <StatusBadge status={rs.status} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {useTemplate && (
        <UseTemplateModal
          template={useTemplate}
          onClose={() => setUseTemplate(null)}
          onCreated={(id) => {
            setUseTemplate(null)
            router.push(`/run-sheets/${id}`)
          }}
          onError={toastError}
        />
      )}

      {showNew && (
        <NewRunSheetModal
          events={events}
          onClose={() => {
            setShowNew(false)
            clear("new")
          }}
          onCreated={(id) => {
            setShowNew(false)
            clear("new")
            success("Run sheet created")
            router.push(`/run-sheets/${id}`)
          }}
          onError={toastError}
        />
      )}
    </div>
  )
}

/**
 * Create a run sheet. The event is optional — a sheet can stand alone, which is the
 * point of decoupling run sheets from scheduling.
 */
function NewRunSheetModal({
  events,
  onClose,
  onCreated,
  onError,
}: {
  events: { id: string; title: string; start_time: string }[]
  onClose: () => void
  onCreated: (id: string) => void
  onError: (message: string) => void
}) {
  const [title, setTitle] = useState("")
  const [eventId, setEventId] = useState("")
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const res = await createStandaloneRunSheet({
      title: title.trim(),
      eventId: eventId || undefined,
      sheetDate: date || undefined,
    })
    setBusy(false)
    if (res.error) return onError(res.error)
    onCreated(res.id as string)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New run sheet"
      description="Only a title and date are needed. Link an event if there is one."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!title.trim()}>Create</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Title" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sunday Service"
            autoFocus
          />
        </FormField>
        <FormField label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField label="Event (optional)">
          <Select
            value={eventId}
            onChange={setEventId}
            placeholder="No event"
            searchable
            options={events.map((e) => ({
              value: e.id,
              label: `${e.title} · ${format(new Date(e.start_time), "MMM d")}`,
            }))}
          />
        </FormField>
      </div>
    </Modal>
  )
}

/**
 * Start a run sheet from a template.
 *
 * Sessions shift by whole days onto the chosen date, so clock times and the gaps between
 * sessions survive the rebase intact.
 */
function UseTemplateModal({
  template,
  onClose,
  onCreated,
  onError,
}: {
  template: RunSheetTemplate
  onClose: () => void
  onCreated: (id: string) => void
  onError: (message: string) => void
}) {
  const [title, setTitle] = useState(template.title.replace(/\s*template$/i, ""))
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const res = await createFromTemplate(template.id, title.trim(), date)
    setBusy(false)
    if (res.error) return onError(res.error)
    onCreated(res.id as string)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New run sheet from template"
      description={`${template.run_sheet_sessions?.length ?? 0} sessions will be copied onto the date you choose.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!title.trim() || !date}>Create</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Title" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  )
}
