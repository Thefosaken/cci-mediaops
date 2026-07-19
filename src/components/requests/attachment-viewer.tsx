"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeft,
  ArrowRight,
  Download,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Presentation,
  RotateCw,
  X
} from "lucide-react"

import { IconButton } from "@/components/ui/button"
import { cn } from "@/lib/utils/cn"
import { attachmentKind, attachmentTypeLabel, formatBytes } from "@/lib/attachments"
import type { AttachmentKind, RequestAttachment } from "@/lib/attachments"

/**
 * One icon per coarse file kind.
 *
 * Lives here rather than in `attachment-field.tsx` because both surfaces need it
 * and the field already imports this module — keeping it the other way round
 * would be a cycle.
 */
export const ATTACHMENT_KIND_ICON: Record<
  AttachmentKind,
  React.ComponentType<{ className?: string }>
> = {
  image: ImageIcon,
  pdf: FileText,
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  text: FileText,
  file: FileIcon
}

/** What this surface can actually render, as opposed to what it can hand over. */
type Preview = "image" | "pdf" | "none"

function previewFor(mime: string): Preview {
  const kind = attachmentKind(mime)
  if (kind === "image") return "image"
  if (kind === "pdf") return "pdf"
  // Word, Excel, PowerPoint, TXT and CSV. A browser will either download them or
  // render them as bytes; neither is a preview, so we don't pretend otherwise.
  return "none"
}

/**
 * Storage signs downloads with a JWT in the `token` query param, and that JWT
 * carries its own expiry. Reading it lets the viewer notice a stale link *before*
 * it paints a broken image — which matters most for PDFs, where a dead URL loads
 * an error document into the iframe and `onError` never fires.
 *
 * Anything unparseable is treated as good: this is an optimisation, and the
 * `onError` path below is still the real safety net.
 */
function isSignedUrlExpired(url: string): boolean {
  try {
    const token = new URL(url, window.location.origin).searchParams.get("token")
    if (!token) return false
    const payload = token.split(".")[1]
    if (!payload) return false
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    const exp = (JSON.parse(json) as { exp?: number }).exp
    if (typeof exp !== "number") return false
    // 30s of slack so a link about to die is refreshed rather than raced.
    return exp * 1000 <= Date.now() + 30_000
  } catch {
    return false
  }
}

/**
 * Ask Storage to send the file as an attachment instead of rendering it. Same
 * signed URL, one extra parameter — no second round trip to get a download link.
 */
function downloadUrl(url: string, fileName: string): string {
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}download=${encodeURIComponent(fileName)}`
}

const FOCUSABLE =
  'a[href],button:not([disabled]),iframe,input:not([disabled]),[tabindex]:not([tabindex="-1"])'

export interface AttachmentViewerProps {
  /** Mounted at all times; this is what opens and closes it. */
  open: boolean
  /** The attachments that can be stepped through. Index 0 is the oldest. */
  items: RequestAttachment[]
  /** Which one is showing. Controlled, so the opener decides where to start. */
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  /**
   * Re-reads the attachment list, which mints fresh signed URLs.
   *
   * Called automatically when the current link has expired and manually from the
   * error state. Without it the viewer still works — it just can't recover a
   * dead link, so the retry affordance is hidden.
   */
  onRetry?: () => void | Promise<void>
}

/**
 * Full-surface viewer for one request attachment, with the request's other
 * attachments a keystroke away.
 *
 * A bespoke overlay rather than `Modal`: media wants a wider, darker surface than
 * §12.19's 520px dialog, and the stage has to own its own height. It keeps
 * `Modal`'s structure though — portal to `document.body`, backdrop click and
 * Escape to close, and the focus effect depending on `open` *alone* (see
 * CLAUDE.md: adding `onClose` there re-focuses on every parent render and steals
 * focus back from anything inside).
 */
export function AttachmentViewer({
  open,
  items,
  index,
  onIndexChange,
  onClose,
  onRetry
}: AttachmentViewerProps) {
  const titleId = React.useId()
  const panelRef = React.useRef<HTMLDivElement>(null)
  const restoreRef = React.useRef<HTMLElement | null>(null)

  const [refreshing, setRefreshing] = React.useState(false)
  /** Signed URLs already re-fetched once, so a dead link can't loop forever. */
  const attempted = React.useRef(new Set<string>())

  const total = items.length
  const position = Math.min(Math.max(index, 0), Math.max(total - 1, 0))
  const item: RequestAttachment | undefined = items[position]

  const hasPrev = position > 0
  const hasNext = position < total - 1

  /**
   * Close, then hand focus back to whatever opened the viewer. The frame's delay
   * is deliberate: the portal has to unmount first, or the browser parks focus
   * on `<body>` immediately afterwards and the restore is undone.
   */
  const closeAndRestore = React.useCallback(() => {
    const target = restoreRef.current
    onClose()
    window.requestAnimationFrame(() => target?.focus())
  }, [onClose])

  const refresh = React.useCallback(async () => {
    if (!onRetry) return
    setRefreshing(true)
    try {
      await onRetry()
    } finally {
      setRefreshing(false)
    }
  }, [onRetry])

  /*
    Remember where focus came from, on the open transition only. Reading it here
    rather than taking the element as a prop is what keeps it correct: at the
    point this effect runs, React has committed the render the click caused but
    the browser has not moved focus, so `activeElement` is still the card that
    was clicked.
  */
  React.useEffect(() => {
    if (!open) return
    const active = document.activeElement
    restoreRef.current = active instanceof HTMLElement ? active : null
  }, [open])

  // Move focus in. Deps are `[open]` and must stay that way.
  React.useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  /*
    Escape and the arrows are taken in the capture phase and stopped there. The
    requests page has its own document-level handler for Escape and j/k — without
    this, one Escape would close the viewer *and* the detail panel behind it.
  */
  React.useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      switch (event.key) {
        case "Escape":
          event.preventDefault()
          event.stopPropagation()
          closeAndRestore()
          break
        case "ArrowRight":
          if (position >= total - 1) return
          event.preventDefault()
          event.stopPropagation()
          onIndexChange(position + 1)
          break
        case "ArrowLeft":
          if (position <= 0) return
          event.preventDefault()
          event.stopPropagation()
          onIndexChange(position - 1)
          break
      }
    }
    document.addEventListener("keydown", onKeyDown, true)
    return () => document.removeEventListener("keydown", onKeyDown, true)
  }, [open, closeAndRestore, onIndexChange, position, total])

  /**
   * Pre-emptive refresh: the link this item was minted with has already expired,
   * so fetch the list again before the stage tries to load it. Keyed by URL, not
   * by id, so a genuinely broken link is attempted once while a link that expires
   * later in a long session is still allowed its own attempt.
   */
  React.useEffect(() => {
    if (!open || !item?.signed_url || !onRetry) return
    const url = item.signed_url
    if (!isSignedUrlExpired(url) || attempted.current.has(url)) return
    attempted.current.add(url)
    void refresh()
  }, [open, item?.signed_url, onRetry, refresh])

  // Nothing left to show — the list emptied under us (a removal, or a refresh
  // that came back short). Closing is the only honest outcome.
  React.useEffect(() => {
    if (open && total === 0) onClose()
  }, [open, total, onClose])

  /** Tab must not walk out of the overlay and into the page underneath it. */
  function trapTab(event: React.KeyboardEvent) {
    if (event.key !== "Tab") return
    const panel = panelRef.current
    if (!panel) return
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    )
    if (focusable.length === 0) {
      event.preventDefault()
      panel.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!open || typeof window === "undefined" || !item) return null

  const Icon = ATTACHMENT_KIND_ICON[attachmentKind(item.mime_type)]
  const typeLabel = attachmentTypeLabel(item.file_name, item.mime_type)
  const preview = previewFor(item.mime_type)

  return createPortal(
    <div className="fixed inset-0 z-[110]">
      {/* Darker than §12.19's dialog scrim on purpose: the stage below is the
          content, and a media surface needs the page to fall away behind it. */}
      <button
        type="button"
        aria-label="Close attachment viewer"
        tabIndex={-1}
        onClick={closeAndRestore}
        className={cn(
          "absolute inset-0 h-full w-full cursor-default bg-black/75 backdrop-blur-[3px]",
          "motion-safe:animate-fade-in [animation-duration:180ms]"
        )}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3 sm:p-6">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={trapTab}
          className={cn(
            "pointer-events-auto relative flex max-h-[92vh] w-full max-w-[1100px] flex-col",
            "overflow-hidden rounded-2xl border border-border bg-surface shadow-xl outline-none",
            "motion-safe:animate-scale-in [animation-duration:220ms]"
          )}
        >
          {/* Header — what it is, then the two things worth doing with it. */}
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-subtle text-muted">
              <Icon aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                title={item.file_name}
                className="truncate text-[14px] font-semibold leading-tight tracking-[-0.01em] text-foreground"
              >
                {item.file_name}
              </h2>
              <p className="mt-0.5 truncate text-[11.5px] text-faint tabular-nums">
                {typeLabel} · {formatBytes(item.size_bytes)}
              </p>
            </div>

            {item.signed_url && (
              <a
                href={downloadUrl(item.signed_url, item.file_name)}
                download={item.file_name}
                // h-11, like the detail panel's header controls: §17.1 puts the
                // floor for a touch target at 44px and this is the one action
                // most likely to be taken on a phone.
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md px-4 text-[13px] font-medium",
                  "border border-border bg-surface text-foreground shadow-sm",
                  "transition-[background,color,border-color,transform] duration-[120ms] ease-[var(--ease-out-quart)]",
                  "hover:bg-surface-hover hover:border-border-strong active:scale-[0.98]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                )}
              >
                <Download aria-hidden="true" className="h-3.5 w-3.5" />
                Download
              </a>
            )}
            <IconButton
              label="Close attachment viewer"
              size="sm"
              className="h-11 w-11"
              onClick={closeAndRestore}
            >
              <X className="h-4 w-4" />
            </IconButton>
          </header>

          {/* Stage. `bg-canvas` rather than a hard black: it is the page's own
              base, so it reads as near-black in dark and near-white in light,
              and a transparent PNG sits correctly on both. */}
          <div
            className={cn(
              "relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-canvas",
              preview === "pdf" ? "h-[70vh]" : "min-h-[220px] p-4"
            )}
          >
            <AttachmentStage
              // Keyed on the URL so a refreshed link remounts the media with its
              // loading and error state cleared, rather than needing to be reset.
              key={item.signed_url ?? item.id}
              attachment={item}
              preview={preview}
              refreshing={refreshing}
              onRetry={
                onRetry
                  ? () => {
                      if (item.signed_url) attempted.current.delete(item.signed_url)
                      void refresh()
                    }
                  : undefined
              }
            />
          </div>

          {/* Footer — the record navigator from the request detail panel, turned
              on its side. Same shape, same disabled-at-the-ends behaviour, so
              stepping through files feels like stepping through requests. */}
          {total > 1 && (
            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-4 py-2">
              <span className="text-[12px] tabular-nums text-muted">
                {position + 1} of {total}
              </span>
              <div className="flex items-center gap-1">
                <IconButton
                  label="Previous attachment"
                  size="sm"
                  variant="ghost"
                  className="h-11 w-11"
                  disabled={!hasPrev}
                  onClick={() => onIndexChange(position - 1)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label="Next attachment"
                  size="sm"
                  variant="ghost"
                  className="h-11 w-11"
                  disabled={!hasNext}
                  onClick={() => onIndexChange(position + 1)}
                >
                  <ArrowRight className="h-4 w-4" />
                </IconButton>
              </div>
            </footer>
          )}

          <span aria-live="polite" className="sr-only">
            {total > 1
              ? `${item.file_name}, ${position + 1} of ${total}`
              : item.file_name}
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * The stage's contents for one attachment.
 *
 * Mounted fresh per signed URL (see the `key` at the call site), which is what
 * makes "retry" work without any state to reset: a new link is a new element.
 */
function AttachmentStage({
  attachment,
  preview,
  refreshing,
  onRetry
}: {
  attachment: RequestAttachment
  preview: Preview
  refreshing: boolean
  onRetry?: () => void
}) {
  const url = attachment.signed_url
  const [loaded, setLoaded] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  if (!url) {
    return (
      <StageMessage
        title="This file can't be opened right now"
        body="Its download link couldn't be created. Refreshing the list usually fixes it."
        refreshing={refreshing}
        onRetry={onRetry}
      />
    )
  }

  if (failed) {
    return (
      <StageMessage
        title="This file didn't load"
        body="Download links expire an hour after the list is read. Refresh to get a new one, or download the file directly."
        refreshing={refreshing}
        onRetry={onRetry}
        action={
          <StageDownload url={url} fileName={attachment.file_name} variant="secondary" />
        }
      />
    )
  }

  if (preview === "none") {
    const Icon = ATTACHMENT_KIND_ICON[attachmentKind(attachment.mime_type)]
    return (
      <div className="flex max-w-[380px] flex-col items-center gap-3 px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface text-muted">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <p
            title={attachment.file_name}
            className="max-w-[340px] truncate text-[14px] font-medium text-foreground"
          >
            {attachment.file_name}
          </p>
          <p className="mt-1 text-[12px] text-muted tabular-nums">
            {attachmentTypeLabel(attachment.file_name, attachment.mime_type)} ·{" "}
            {formatBytes(attachment.size_bytes)}
          </p>
        </div>
        <p className="text-[13px] leading-snug text-muted">
          {attachmentTypeLabel(attachment.file_name, attachment.mime_type)} files can&apos;t be
          previewed in the browser. Download it to open it in the app it belongs to.
        </p>
        <StageDownload url={url} fileName={attachment.file_name} variant="primary" />
      </div>
    )
  }

  return (
    <>
      {preview === "image" ? (
        /* A plain <img>, not next/image: these are arbitrary Supabase signed
           URLs and the loader would need every project host allow-listed in
           next.config.ts. No width/height either — the natural size is the cap,
           and max-* only ever shrinks it, so nothing is upscaled. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={attachment.file_name}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "max-h-full max-w-full object-contain",
            "transition-opacity duration-[180ms] ease-[var(--ease-out-quart)]",
            loaded ? "opacity-100" : "opacity-0"
          )}
        />
      ) : (
        <iframe
          src={url}
          title={`${attachment.file_name} preview`}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          // Absolutely positioned rather than `h-full`: the stage centres its
          // child, and a percentage height against a centred flex item is not
          // reliable. `inset-0` fills it regardless of alignment.
          className={cn(
            "absolute inset-0 h-full w-full border-0",
            "transition-opacity duration-[180ms] ease-[var(--ease-out-quart)]",
            loaded ? "opacity-100" : "opacity-0"
          )}
        />
      )}

      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[13px] text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Loading {preview === "pdf" ? "PDF" : "image"}…
        </div>
      )}
    </>
  )
}

/** Shared shape for the two things that can go wrong on the stage. */
function StageMessage({
  title,
  body,
  refreshing,
  onRetry,
  action
}: {
  title: string
  body: string
  refreshing: boolean
  onRetry?: () => void
  action?: React.ReactNode
}) {
  return (
    <div role="alert" className="flex max-w-[400px] flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      <p className="text-[13px] leading-snug text-muted">{body}</p>
      <div className="mt-1 flex items-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={refreshing}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium",
              "border border-primary bg-primary text-white shadow-sm",
              "transition-[background,transform] duration-[120ms] ease-[var(--ease-out-quart)]",
              "hover:bg-primary-dark active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            )}
          >
            <RotateCw
              aria-hidden="true"
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            />
            {refreshing ? "Refreshing…" : "Retry"}
          </button>
        )}
        {action}
      </div>
    </div>
  )
}

function StageDownload({
  url,
  fileName,
  variant
}: {
  url: string
  fileName: string
  variant: "primary" | "secondary"
}) {
  return (
    <a
      href={downloadUrl(url, fileName)}
      download={fileName}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium shadow-sm",
        "transition-[background,color,border-color,transform] duration-[120ms] ease-[var(--ease-out-quart)]",
        "active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        variant === "primary"
          ? "border border-primary bg-primary text-white hover:bg-primary-dark"
          : "border border-border bg-surface text-foreground hover:bg-surface-hover hover:border-border-strong"
      )}
    >
      <Download aria-hidden="true" className="h-3.5 w-3.5" />
      Download
    </a>
  )
}
