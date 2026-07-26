"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { ArrowRight, Users } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { copyRosterToSlot } from "@/server/actions/duties"
import { TEAM_COLORS, type TeamColor } from "./team-colors"

import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

/**
 * "Same people as last Sunday."
 *
 * The most repeated action in rostering, and the one most often done by hand — which
 * is where the mistakes come from. The candidates are ranked by how like the target
 * they are (same service of the same event, most recent first), because the answer is
 * almost always the previous week and making the user hunt for it defeats the point.
 *
 * Who would come across is shown before anything is written. A copy that silently
 * skips two people is worse than no copy: the lead believes the service is staffed.
 */

export interface CopyableSlot {
  id: string
  label: string
  slot_order: number
  slot_date: string
  event_id: string
  event_title: string
  /** People currently on this slot, for the preview. */
  duties: { user_id: string; sub_team_id: string; full_name: string; role_title: string | null }[]
}

export function CopyRosterModal({
  target,
  candidates,
  teams,
  colorFor,
  canPublish,
  onClose,
  onDone,
  onError
}: {
  target: CopyableSlot
  /** Every other slot in view, unranked — this component decides the order. */
  candidates: CopyableSlot[]
  teams: { id: string; name: string; color: string | null }[]
  colorFor: Map<string, TeamColor>
  canPublish: boolean
  onClose: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [asDraft, setAsDraft] = useState(!canPublish)
  const [saving, setSaving] = useState(false)

  /**
   * Ranked, not merely listed. A slot with nobody on it can never be the answer, so it
   * is excluded rather than offered and then found empty.
   */
  const ranked = useMemo(() => {
    return candidates
      .filter((c) => c.id !== target.id && c.duties.length > 0)
      .map((c) => {
        // Same service of the same recurring event is the overwhelmingly likely
        // intent; same event any service is next; anything else is a long shot.
        const sameEvent = c.event_title === target.event_title
        const sameSlot = c.slot_order === target.slot_order
        const affinity = sameEvent && sameSlot ? 0 : sameEvent ? 1 : 2
        return { slot: c, affinity }
      })
      .sort((a, b) => {
        if (a.affinity !== b.affinity) return a.affinity - b.affinity
        // Most recent first within a tier — last week beats last year.
        return b.slot.slot_date.localeCompare(a.slot.slot_date)
      })
      .slice(0, 8)
      .map((r) => r.slot)
  }, [candidates, target])

  const source = ranked.find((c) => c.id === sourceId) ?? null

  /** Who is already on the target, so the preview can mark who would be a duplicate. */
  const alreadyThere = useMemo(
    () => new Set(target.duties.map((d) => d.user_id)),
    [target.duties]
  )

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "Unknown team"

  const submit = async () => {
    if (!source) return
    setSaving(true)
    const res = await copyRosterToSlot(source.id, target.id, { asDraft })
    setSaving(false)

    if (res.error) return onError(res.error)

    // Skips are reported, never swallowed — the lead needs to know which gaps remain.
    const skipped = res.skipped ?? []
    onDone(
      skipped.length
        ? `Copied ${res.copied} · ${skipped.length} skipped — ${skipped[0]}`
        : `Copied ${res.copied} ${res.copied === 1 ? "person" : "people"} to ${target.label}`
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Copy a roster"
      description={`Onto ${target.label} · ${format(new Date(`${target.slot_date}T12:00:00`), "EEEE d MMMM")}`}
      size="default"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!source} onClick={submit}>
            {source ? `Copy ${source.duties.length}` : "Copy"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            Copy from
          </h3>

          {ranked.length === 0 ? (
            <p className="rounded-md border border-border bg-surface px-3 py-4 text-center text-[12.5px] text-faint">
              There is no other service with anybody on it to copy from yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {ranked.map((c) => {
                const chosen = c.id === sourceId
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSourceId(c.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors duration-150",
                        chosen
                          ? "border-primary bg-[var(--color-primary-soft)]"
                          : "border-border bg-surface hover:bg-surface-subtle"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-foreground">
                          {c.event_title} — {c.label}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] text-muted">
                          {format(new Date(`${c.slot_date}T12:00:00`), "EEE d MMM")}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-[11.5px] tabular-nums text-muted">
                        <Users className="size-3.5 text-faint" />
                        {c.duties.length}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {source && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Who moves across
              <ArrowRight className="size-3" />
              <span className="normal-case tracking-normal text-faint">{target.label}</span>
            </h3>

            <ul className="space-y-0.5 rounded-md border border-border bg-surface p-2">
              {source.duties.map((d) => {
                const duplicate = alreadyThere.has(d.user_id)
                return (
                  <li
                    key={`${d.user_id}-${d.sub_team_id}`}
                    className="flex items-center gap-2 rounded px-1.5 py-1"
                  >
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        TEAM_COLORS[colorFor.get(d.sub_team_id) ?? "blue"].dot,
                        duplicate && "opacity-40"
                      )}
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[12.5px]",
                        duplicate ? "text-faint line-through" : "text-foreground"
                      )}
                    >
                      {d.full_name}
                    </span>
                    <span className="shrink-0 truncate text-[11px] text-muted">
                      {duplicate ? "already on" : (d.role_title ?? teamName(d.sub_team_id))}
                    </span>
                  </li>
                )
              })}
            </ul>

            {/* Anyone clashing elsewhere that day is rejected by the database and
                reported back by name. Saying so up front means a partial copy reads as
                the rule working rather than as something having gone wrong. */}
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              Roles and call times come across. Confirmations do not — accepting last week
              is not accepting this one. Anyone already rostered elsewhere that day is
              skipped and named.
            </p>
          </section>
        )}

        <section className="flex items-start justify-between gap-4 border-t border-border-subtle pt-4">
          <span>
            <span className="block text-[12.5px] font-medium text-foreground">Save as draft</span>
            <span className="mt-0.5 block text-[11.5px] text-muted">
              {canPublish
                ? "Nobody is told until you publish."
                : "Your lead publishes the roster, so copies are always drafted."}
            </span>
          </span>
          <Switch
            checked={asDraft}
            onChange={setAsDraft}
            disabled={!canPublish}
            label="Save as draft"
          />
        </section>
      </div>
    </Modal>
  )
}
