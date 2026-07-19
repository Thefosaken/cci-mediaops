"use client"

import * as React from "react"
import { format } from "date-fns"
import { Loader2, Paperclip, Upload, X } from "lucide-react"

import { IconButton } from "@/components/ui/button"
import { cn } from "@/lib/utils/cn"
import {
  ATTACHMENT_ACCEPT,
  ALLOWED_TYPES_LABEL,
  MAX_ATTACHMENTS_PER_REQUEST,
  MAX_ATTACHMENT_TOTAL_BYTES,
  attachmentKind,
  attachmentTypeLabel,
  describeRejection,
  describeTotalRejection,
  formatBytes
} from "@/lib/attachments"
import type { RequestAttachment } from "@/lib/attachments"
import { uploadAttachment } from "@/lib/attachments/upload"
import { deleteRequestAttachment, listRequestAttachments } from "@/server/actions/attachments"

import { ATTACHMENT_KIND_ICON, AttachmentViewer } from "./attachment-viewer"

export interface AttachmentFieldProps {
  /**
   * The request these files belong to.
   *
   * Present = **live mode**: every file uploads the moment it is dropped and the
   * component owns the list, loading it from the server.
   *
   * Absent = **staged mode**: the record does not exist yet (a create form), so
   * files are validated and held in memory. The parent submits the record, then
   * hands the staged files to `uploadStagedAttachments` from
   * `@/lib/attachments/upload`.
   */
  requestId?: string
  /**
   * Public link token. Present = the uploader has no session and uploads take
   * the token-scoped route. Ignored when the visitor is signed in.
   */
  token?: string
  /** Staged mode: the files currently held. Controlled by the parent. */
  files?: File[]
  /** Staged mode: called whenever the held set changes. */
  onFilesChange?: (files: File[]) => void
  /** Live mode: fired after a successful upload or removal, for `router.refresh()`. */
  onChanged?: () => void
  disabled?: boolean
  /**
   * View the attachments without being able to change them: no drop zone, no
   * file picker, no remove buttons. Opening a file in the viewer still works.
   *
   * `disabled` is not the same thing — that is a temporary "not right now"
   * (a form mid-submit) and keeps the target on screen, greyed. This says the
   * surface has no upload affordance at all, so it doesn't render one.
   */
  readOnly?: boolean
  /** Heading above the drop zone. */
  label?: string
  className?: string
}

/** An upload in flight. Kept apart from saved rows — it has no id and no URL yet. */
interface InFlight {
  key: string
  name: string
  size: number
  type: string
  /** 0–1, reported by the XHR upload as the body goes out. */
  progress: number
}

/**
 * Attach files to a request — click the target or drop onto it.
 *
 * Follows §19.3's link-card anatomy for what an attachment shows: title, what it
 * is, who added it, when, and the two actions worth having (open, remove). §19.4
 * asks that uploads stay small and incidental, which is why the cap is 10 MB and
 * the empty state says so up front rather than after a failed attempt.
 */
export function AttachmentField({
  requestId,
  token,
  files,
  onFilesChange,
  onChanged,
  disabled,
  readOnly = false,
  label = "Attachments",
  className
}: AttachmentFieldProps) {
  const live = Boolean(requestId)
  // Memoised so the `files` prop defaulting to a fresh `[]` does not re-make
  // `accept` on every render.
  const staged = React.useMemo(() => files ?? [], [files])

  /*
    No `useToast` here on purpose. The public request form renders outside the
    dashboard Shell, which is the only thing that mounts a ToastProvider — a
    toast call there would throw. Every failure is reported inline under the drop
    target instead, which is where the file would have appeared and is the right
    place for a form-field error regardless.
  */
  /**
   * Drag events fire on children too, so a plain boolean flickers as the pointer
   * crosses a card inside the target. Counting enters against leaves does not.
   */
  const dragDepth = React.useRef(0)

  const [dragging, setDragging] = React.useState(false)
  const [saved, setSaved] = React.useState<RequestAttachment[] | null>(live ? null : [])
  const [inFlight, setInFlight] = React.useState<InFlight[]>([])
  const [rejections, setRejections] = React.useState<string[]>([])
  const [status, setStatus] = React.useState("")
  const [removing, setRemoving] = React.useState<string | null>(null)

  /**
   * Which saved attachment the viewer is showing, or null for closed. Only saved
   * rows are viewable — a staged file has no signed URL yet, and inventing an
   * object URL for it would preview a file that isn't attached to anything.
   */
  const [viewing, setViewing] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    if (!requestId) return
    setSaved(await listRequestAttachments(requestId))
  }, [requestId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (live) void load()
  }, [live, load])

  const count = (saved?.length ?? 0) + staged.length + inFlight.length
  const full = count >= MAX_ATTACHMENTS_PER_REQUEST
  const locked = Boolean(disabled) || full

  /**
   * The one entry point for new files, shared by the picker and the drop.
   *
   * Every file is judged on its own: a batch where one is a 40 MB video attaches
   * the rest and names the one that did not, rather than refusing the lot.
   */
  const accept = React.useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return

      const room = MAX_ATTACHMENTS_PER_REQUEST - count
      const admitted: File[] = []
      const refused: string[] = []

      // Bytes already committed to this request, so the total cap is measured
      // against reality rather than against this drop alone. Accumulates as
      // files are admitted, so dropping five 3 MB files admits three and
      // explains the rest.
      let usedBytes =
        staged.reduce((sum, f) => sum + f.size, 0) +
        (saved ?? []).reduce((sum, a) => sum + (a.size_bytes ?? 0), 0)

      for (const file of incoming) {
        if (admitted.length >= room) {
          refused.push(
            `"${file.name}" wasn't added — a request can hold ${MAX_ATTACHMENTS_PER_REQUEST} attachments.`
          )
          continue
        }
        const rejection = describeRejection(file)
        if (rejection) {
          refused.push(rejection)
          continue
        }
        const overTotal = describeTotalRejection(file, usedBytes)
        if (overTotal) {
          refused.push(overTotal)
          continue
        }
        const clash =
          staged.some((f) => f.name === file.name && f.size === file.size) ||
          (saved ?? []).some((a) => a.file_name === file.name && a.size_bytes === file.size)
        if (clash) {
          refused.push(`"${file.name}" is already attached.`)
          continue
        }
        admitted.push(file)
        usedBytes += file.size
      }

      setRejections(refused)
      if (refused.length > 0) setStatus(refused[0])

      if (admitted.length === 0) return

      // Staged mode: nothing to upload to yet. Hold them and tell the parent.
      if (!requestId) {
        onFilesChange?.([...staged, ...admitted])
        setStatus(
          `${admitted.length} file${admitted.length === 1 ? "" : "s"} ready. They'll upload when you submit.`
        )
        return
      }

      // Live mode: upload now, one at a time, so a slow connection degrades into
      // a queue rather than into five simultaneous timeouts.
      const queued = admitted.map((file) => ({
        key: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0
      }))
      setInFlight((prev) => [...prev, ...queued])
      setStatus(`Uploading ${admitted.length} file${admitted.length === 1 ? "" : "s"}…`)

      const failures: string[] = []
      for (let i = 0; i < admitted.length; i++) {
        const file = admitted[i]
        const key = queued[i].key
        const { error } = await uploadAttachment(file, { requestId, token }, (fraction) => {
          setInFlight((prev) =>
            prev.map((f) => (f.key === key ? { ...f, progress: fraction } : f))
          )
        })
        setInFlight((prev) => prev.filter((f) => f.key !== key))
        if (error) failures.push(error)
      }

      await load()
      onChanged?.()

      if (failures.length > 0) {
        setRejections((prev) => [...prev, ...failures])
        setStatus(failures[0])
      } else {
        setStatus(`${admitted.length} file${admitted.length === 1 ? "" : "s"} attached.`)
      }
    },
    [count, staged, saved, requestId, token, onFilesChange, load, onChanged]
  )

  function handlePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    // Reset first: picking the same file twice in a row must fire `change` again.
    event.target.value = ""
    void accept(picked)
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (locked) return
    void accept(Array.from(event.dataTransfer.files ?? []))
  }

  function removeStaged(index: number) {
    const next = staged.filter((_, i) => i !== index)
    onFilesChange?.(next)
    setStatus(`${staged[index].name} removed.`)
  }

  async function removeSaved(attachment: RequestAttachment) {
    setRemoving(attachment.id)
    const result = await deleteRequestAttachment(attachment.id)
    setRemoving(null)
    if ("error" in result) {
      setRejections([result.error])
      setStatus(`${attachment.file_name} could not be removed. ${result.error}`)
      return
    }
    await load()
    onChanged?.()
    setStatus(`${attachment.file_name} removed.`)
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        {/* Read-only has no budget to report — a slot count and a size cap are
            both instructions for adding files, and there is no adding here. */}
        <span className="text-[11.5px] text-faint tabular-nums">
          {readOnly
            ? count > 0
              ? `${count} file${count === 1 ? "" : "s"}`
              : ""
            : count > 0
              ? `${count} of ${MAX_ATTACHMENTS_PER_REQUEST}`
              : `Up to ${formatBytes(MAX_ATTACHMENT_TOTAL_BYTES)} total`}
        </span>
      </div>

      {readOnly && saved !== null && count === 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface-subtle/40 px-3 py-3 text-[13px] text-muted">
          <Paperclip aria-hidden="true" className="h-3.5 w-3.5 text-faint" />
          No attachments
        </p>
      )}

      {/*
        A real <label> around a real <input type="file">. The input is visually
        hidden but not `display:none`, so it keeps its place in the tab order and
        carries the focus ring out to the target through `peer-focus-visible`.
        No key handlers, no role, no tabindex — the platform already does this.

        Omitted entirely in read-only mode rather than disabled: a greyed drop
        target still says "files go here", which is the wrong promise to make on
        a request nobody on the team is going to add files to.
      */}
      {!readOnly && (
        <label
          onDragEnter={(e) => {
            e.preventDefault()
            if (locked) return
            dragDepth.current += 1
            setDragging(true)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault()
            dragDepth.current -= 1
            if (dragDepth.current <= 0) {
              dragDepth.current = 0
              setDragging(false)
            }
          }}
          onDrop={handleDrop}
          className={cn(
            "group relative flex cursor-pointer flex-col items-center justify-center gap-1.5",
            "rounded-lg border border-dashed border-border bg-surface-subtle/40 px-4 py-5 text-center",
            // Only colour and shadow move — no layout property is animated, so the
            // target cannot shift under a pointer that is mid-drag over it.
            "transition-[background-color,border-color,box-shadow] duration-[150ms] ease-[var(--ease-out-quart)]",
            "hover:border-border-strong hover:bg-surface-subtle",
            // The input is a child, not a sibling, so the ring is pulled out to
            // the target with `:has()` rather than Tailwind's `peer-`.
            "has-[input:focus-visible]:border-focus-ring has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-focus-ring",
            dragging && "border-primary bg-primary/5 shadow-sm",
            locked && "cursor-not-allowed opacity-60 hover:border-border hover:bg-surface-subtle/40"
          )}
        >
          <input
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            disabled={locked}
            onChange={handlePicked}
            className="sr-only"
          />
          <Upload
            aria-hidden="true"
            className={cn(
              "h-4 w-4 text-faint",
              "transition-transform duration-[150ms] ease-[var(--ease-out-quart)]",
              "group-hover:text-muted motion-safe:group-hover:-translate-y-0.5",
              dragging && "text-primary motion-safe:-translate-y-0.5"
            )}
          />
          <span className="text-[13px] text-foreground">
            {full ? (
              `All ${MAX_ATTACHMENTS_PER_REQUEST} slots are full`
            ) : dragging ? (
              "Drop to attach"
            ) : (
              <>
                <span className="font-medium underline-offset-2 group-hover:underline">Choose a file</span>
                <span className="text-muted"> or drop one here</span>
              </>
            )}
          </span>
          <span className="text-[11.5px] text-faint">
            {ALLOWED_TYPES_LABEL} · {formatBytes(MAX_ATTACHMENT_TOTAL_BYTES)} total
          </span>
        </label>
      )}

      {/* Rejections sit under the target, where the file would have appeared. */}
      {rejections.length > 0 && (
        <ul className="space-y-1">
          {rejections.map((message, i) => (
            <li key={i} role="alert" className="text-[12px] leading-snug text-danger">
              {message}
            </li>
          ))}
        </ul>
      )}

      {(saved === null || count > 0) && (
        <ul className="space-y-1.5">
          {saved === null && (
            <li className="flex items-center gap-2 px-1 text-[12px] text-faint">
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> Loading attachments…
            </li>
          )}

          {(saved ?? []).map((attachment, index) => (
            <AttachmentCard
              key={attachment.id}
              name={attachment.file_name}
              mime={attachment.mime_type}
              size={attachment.size_bytes}
              meta={[
                attachment.uploaded_by_name ?? "Added with the request",
                format(new Date(attachment.created_at), "MMM d")
              ].join(" · ")}
              onOpen={() => setViewing(index)}
              busy={removing === attachment.id}
              onRemove={readOnly ? undefined : () => void removeSaved(attachment)}
            />
          ))}

          {staged.map((file, index) => (
            <AttachmentCard
              key={`${file.name}-${file.size}-${index}`}
              name={file.name}
              mime={file.type}
              size={file.size}
              meta="Uploads when you submit"
              onRemove={readOnly ? undefined : () => removeStaged(index)}
            />
          ))}

          {inFlight.map((file) => (
            <AttachmentCard
              key={file.key}
              name={file.name}
              mime={file.type}
              size={file.size}
              meta={`Uploading… ${Math.round(file.progress * 100)}%`}
              uploading
              progress={file.progress}
            />
          ))}
        </ul>
      )}

      {/*
        Status, not decoration: this is the only channel that reports a rejected
        file or a finished upload to a screen reader, since the visual cues are a
        colour change and a card appearing.
      */}
      <span aria-live="polite" className="sr-only">
        {status}
      </span>

      {/*
        Opens over the page instead of navigating away. Retry re-reads the list,
        which is the only way to get a fresh signed URL — they are minted per
        read and expire an hour later, so a panel left open over lunch is holding
        links that no longer resolve.
      */}
      <AttachmentViewer
        open={viewing !== null}
        items={saved ?? []}
        index={viewing ?? 0}
        onIndexChange={setViewing}
        onClose={() => setViewing(null)}
        onRetry={live ? load : undefined}
      />
    </div>
  )
}

/**
 * One attachment, in the §19.3 shape: what it is, then what it is made of, then
 * the two actions. Open is the title itself when there is somewhere to go —
 * making the name the trigger means the biggest target is the one people reach
 * for.
 *
 * It is a `<button>`, not an `<a target="_blank">`: opening the file no longer
 * leaves the page, so the control should not claim to navigate. Anyone who does
 * want the file on disk gets the Download action inside the viewer.
 */
function AttachmentCard({
  name,
  mime,
  size,
  meta,
  onOpen,
  uploading,
  progress,
  busy,
  onRemove
}: {
  name: string
  mime: string
  size: number
  meta: string
  /** Absent = nothing to open yet (a staged or in-flight file). */
  onOpen?: () => void
  uploading?: boolean
  /** 0-1 while uploading. */
  progress?: number
  busy?: boolean
  onRemove?: () => void
}) {
  const Icon = ATTACHMENT_KIND_ICON[attachmentKind(mime)]

  return (
    <li
      className={cn(
        "group/card relative flex items-center gap-2.5 overflow-hidden rounded-md border border-border",
        "bg-surface px-2.5 py-2",
        "transition-colors duration-[150ms] ease-[var(--ease-out-quart)] hover:border-border-strong",
        "motion-safe:animate-fade-in [animation-duration:180ms]",
        busy && "opacity-60"
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-surface-subtle text-muted">
        {uploading ? (
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            aria-haspopup="dialog"
            className={cn(
              "block max-w-full truncate text-left text-[13px] font-medium text-foreground",
              "rounded-sm underline-offset-2 hover:underline",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            )}
            title={`Open ${name}`}
          >
            {name}
          </button>
        ) : (
          <span className="block truncate text-[13px] font-medium text-foreground" title={name}>
            {name}
          </span>
        )}
        <span className="block truncate text-[11.5px] text-faint">
          {attachmentTypeLabel(name, mime)} · {formatBytes(size)} · {meta}
        </span>
      </div>

      {onRemove && (
        <IconButton
          label={`Remove ${name}`}
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={onRemove}
          // Hidden until the row is engaged, but never for keyboard users — a
          // control you can tab to must be a control you can see.
          className="opacity-0 transition-opacity duration-[120ms] group-hover/card:opacity-100 focus-visible:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </IconButton>
      )}

      {/*
        Determinate: the XHR upload reports real bytes sent, so the bar means
        something. `scaleX` on a full-width track rather than an animated
        `width`, so it composites on the GPU and never triggers layout.
      */}
      {uploading && (
        <span
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((progress ?? 0) * 100)}
          aria-label={`Uploading ${name}`}
          className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-border"
        >
          <span
            aria-hidden="true"
            className="block h-full origin-left bg-primary transition-transform duration-150 ease-out"
            style={{ transform: `scaleX(${progress ?? 0})` }}
          />
        </span>
      )}
    </li>
  )
}
