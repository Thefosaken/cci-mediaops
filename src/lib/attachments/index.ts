/**
 * Shared vocabulary for request attachments.
 *
 * Imported by the browser component, the authenticated server actions and the
 * public (token-scoped) server actions alike, so it must stay free of
 * `server-only` and of any Supabase client. The limits here are duplicated in
 * two other places on purpose:
 *
 *   1. the `request-attachments` bucket row (migration 00020) — enforced by
 *      Storage on every upload, including signed-URL uploads from the public
 *      form, and therefore the only limit a hostile client cannot argue with
 *   2. the `size_bytes` check constraint on `request_attachments`
 *
 * The copy in this file exists to fail *early* and *legibly*: a browser that
 * knows the cap can say "That file is 24 MB. The limit is 10 MB." before
 * spending anyone's bandwidth. It is a courtesy, not a control.
 */

export const ATTACHMENT_BUCKET = "request-attachments"

/**
 * 10 MB per file — the bucket's own `file_size_limit` in migration 00020, which
 * is the enforcing copy. No single file can exceed this regardless of the
 * total below.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/**
 * 10 MB across every attachment on one request.
 *
 * The per-file cap alone still allowed 10 × 10 MB = 100 MB per request, which
 * on an unauthenticated public link is an open-ended storage bill. This is the
 * ceiling that actually bounds it.
 */
export const MAX_ATTACHMENT_TOTAL_BYTES = 10 * 1024 * 1024

/**
 * Per-request ceiling. Guards the public form specifically: without it, one
 * valid link token is an unbounded object store.
 */
export const MAX_ATTACHMENTS_PER_REQUEST = 10

/**
 * Accepted types, grouped only so the error message can name the group.
 *
 * `image/svg+xml` is absent by design — an SVG can carry script and these files
 * are served back to staff from our own origin.
 */
export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
] as const

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

/** For the `accept` attribute on the file input — a hint to the picker, nothing more. */
export const ATTACHMENT_ACCEPT = ALLOWED_MIME_TYPES.join(",")

/** Human list used in the empty state and in rejection messages. */
export const ALLOWED_TYPES_LABEL = "images, PDF, Word, Excel, PowerPoint, TXT and CSV"

/**
 * The repo's `{ success } / { error }` action contract, written down.
 *
 * Declared explicitly rather than inferred because inference on a function with
 * five `return { error: … }` branches produces a union the `in` operator will
 * not narrow cleanly at the call site.
 */
export type AttachmentActionResult = { success: true } | { error: string }

export interface RequestAttachment {
  id: string
  request_id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  uploaded_by: string | null
  created_at: string
  /** Short-lived download URL, minted when the list is read. */
  signed_url: string | null
  /** Resolved display name of the uploader. Null for public submissions. */
  uploaded_by_name: string | null
}

export function isAllowedMimeType(mime: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime)
}

/**
 * Bytes as something a person can act on. Deliberately coarse — nobody
 * rejecting a file needs three decimal places.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * A stable, coarse kind for icon and label purposes. Not security-relevant —
 * `isAllowedMimeType` is the gate.
 */
export type AttachmentKind = "image" | "pdf" | "doc" | "sheet" | "slides" | "text" | "file"

export function attachmentKind(mime: string): AttachmentKind {
  if (mime.startsWith("image/")) return "image"
  if (mime === "application/pdf") return "pdf"
  if (mime.includes("word")) return "doc"
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return "sheet"
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "slides"
  if (mime.startsWith("text/")) return "text"
  return "file"
}

/** Short type name for the card's second line, e.g. "PDF · 1.2 MB". */
export function attachmentTypeLabel(fileName: string, mime: string): string {
  const ext = fileName.includes(".") ? fileName.split(".").pop() : null
  if (ext && ext.length <= 4) return ext.toUpperCase()
  const kind = attachmentKind(mime)
  return kind === "file" ? "File" : kind.toUpperCase()
}

/**
 * Why this file cannot be attached, or null if it can.
 *
 * Design system §13.3: name the file, name the number, name the limit. "Invalid
 * input" tells someone holding a 24 MB video absolutely nothing.
 */
export function describeRejection(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) {
    return `"${file.name}" is empty. Pick a file with content in it.`
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `"${file.name}" is ${formatBytes(file.size)}. The limit is ${formatBytes(
      MAX_ATTACHMENT_BYTES
    )} — compress it or share a link instead.`
  }
  if (!isAllowedMimeType(file.type)) {
    const named = file.type ? `${attachmentTypeLabel(file.name, file.type)} files` : "That file type"
    return `${named} can't be attached. Accepted: ${ALLOWED_TYPES_LABEL}.`
  }
  return null
}

/**
 * Why this file cannot join the ones already attached, or null if it can.
 *
 * Separate from `describeRejection` because it is a property of the *batch*,
 * not the file: a 6 MB PDF is perfectly valid on its own and only becomes a
 * problem next to another 6 MB PDF. The message says how much room is left so
 * the answer is actionable rather than just a refusal.
 */
export function describeTotalRejection(
  file: { name: string; size: number },
  existingBytes: number
): string | null {
  if (existingBytes + file.size <= MAX_ATTACHMENT_TOTAL_BYTES) return null

  const remaining = Math.max(0, MAX_ATTACHMENT_TOTAL_BYTES - existingBytes)
  if (remaining === 0) {
    return `This request already has ${formatBytes(
      MAX_ATTACHMENT_TOTAL_BYTES
    )} attached, which is the limit. Remove something to add "${file.name}".`
  }
  return `"${file.name}" is ${formatBytes(file.size)} but only ${formatBytes(
    remaining
  )} of the ${formatBytes(MAX_ATTACHMENT_TOTAL_BYTES)} limit is left.`
}

/**
 * An object key that is safe in a URL and cannot collide.
 *
 * The uuid prefix is what makes two people attaching "screenshot.png" to the
 * same request work; the sanitising is what stops a name with a slash in it
 * from inventing a folder.
 */
export function buildStoragePath(requestId: string, fileName: string): string {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-80)
  const safe = cleaned.length > 0 ? cleaned : "file"
  return `${requestId}/${crypto.randomUUID()}-${safe}`
}
