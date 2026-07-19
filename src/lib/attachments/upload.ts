"use client"

import { createClient } from "@/lib/supabase/client"
import {
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_BYTES,
  buildStoragePath,
  describeRejection,
  formatBytes,
  ALLOWED_TYPES_LABEL
} from "@/lib/attachments"
import {
  createPublicAttachmentUpload,
  recordPublicAttachment,
  recordRequestAttachment
} from "@/server/actions/attachments"

export interface UploadTarget {
  requestId: string
  /**
   * Public link token. Present = the uploader has no session, so the bytes go
   * through a server-minted signed URL rather than straight at the bucket.
   */
  token?: string
}

/** Fraction complete, 0–1, for one file. */
export type ProgressHandler = (fraction: number) => void

/**
 * PUTs the bytes to a signed upload URL over XHR, reporting real progress.
 *
 * `supabase-js` has no progress callback — it uses `fetch`, which cannot report
 * request-body progress. XHR's `upload.onprogress` can, which is the whole
 * reason this exists rather than calling `uploadToSignedUrl`. A 10 MB file on
 * church wifi is thirty seconds of silence otherwise, and an indeterminate bar
 * is indistinguishable from a hang.
 *
 * Both the signed-in and public paths go through here, so there is one upload
 * mechanism to reason about instead of two.
 */
function putSigned(
  signedUrl: string,
  file: File,
  onProgress?: ProgressHandler
): Promise<{ error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", signedUrl, true)
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream")
    // Storage rejects an upload onto an existing key unless told otherwise;
    // paths are uuid-prefixed so a collision means a genuine retry.
    xhr.setRequestHeader("x-upsert", "false")

    if (onProgress) {
      onProgress(0)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total)
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1)
        resolve({})
        return
      }
      // Storage returns JSON errors; fall back to the status if it is not JSON.
      let message = `Upload failed (${xhr.status}).`
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string }
        message = body.message ?? body.error ?? message
      } catch {
        // Non-JSON body — the status line is all we have.
      }
      resolve({ error: humanizeStorageError(message) })
    }

    xhr.onerror = () => resolve({ error: "Upload failed — check your connection and try again." })
    xhr.onabort = () => resolve({ error: "Upload cancelled." })
    xhr.ontimeout = () => resolve({ error: "Upload timed out — check your connection and try again." })

    xhr.send(file)
  })
}

/**
 * Storage speaks HTTP status codes and Go error strings. Nobody attaching a
 * holiday photo should have to read either, and §13.3 asks for a message that
 * says what to do next.
 */
function humanizeStorageError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes("exceeded") || lower.includes("too large") || lower.includes("413")) {
    return `That file is over the ${formatBytes(MAX_ATTACHMENT_BYTES)} limit. Compress it or share a link instead.`
  }
  if (lower.includes("mime") || lower.includes("content type") || lower.includes("not supported")) {
    return `That file type can't be attached. Accepted: ${ALLOWED_TYPES_LABEL}.`
  }
  if (lower.includes("already exists") || lower.includes("duplicate")) {
    return "That file has already been attached."
  }
  if (lower.includes("row-level security") || lower.includes("unauthorized") || lower.includes("jwt")) {
    return "You're not signed in any more. Reload the page and try again."
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Upload failed — check your connection and try again."
  }
  return message
}

/**
 * Puts one file in the bucket and records it against the request.
 *
 * Two round trips, in this order, on both paths: the bytes first, the row
 * second. A row written before the upload could point at nothing; an object
 * written before the row is at worst an orphan, and the recording actions clean
 * up after themselves when the insert fails.
 *
 * Returns a message on failure rather than throwing — a batch of five files
 * where the third is oversized should attach the other four and say so.
 */
export async function uploadAttachment(
  file: File,
  target: UploadTarget,
  onProgress?: ProgressHandler
): Promise<{ error?: string }> {
  // Cheap local check first, so an obviously-wrong file never leaves the machine.
  const rejection = describeRejection(file)
  if (rejection) return { error: rejection }

  const supabase = createClient()

  try {
    if (target.token) {
      // Unauthenticated: ask the server for a one-shot slot. The service-role key
      // that mints it stays on the server; the browser only ever sees a URL good
      // for one path for a few minutes.
      const slot = await createPublicAttachmentUpload(
        target.token,
        target.requestId,
        file.name,
        file.size,
        file.type
      )
      if ("error" in slot) return { error: slot.error }

      const { error } = await putSigned(slot.signedUrl, file, onProgress)
      if (error) return { error }

      const recorded = await recordPublicAttachment(
        target.token,
        target.requestId,
        slot.storagePath,
        file.name
      )
      if ("error" in recorded) return { error: recorded.error }
      return {}
    }

    // Signed in: the session's own RLS grant is enough to mint a signed URL for
    // itself. Going through a signed URL rather than `.upload()` is what buys
    // real progress on this path too.
    const storagePath = buildStoragePath(target.requestId, file.name)
    const { data: signed, error: signError } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUploadUrl(storagePath)
    if (signError || !signed) {
      return { error: humanizeStorageError(signError?.message ?? "Could not start the upload.") }
    }

    const { error } = await putSigned(signed.signedUrl, file, onProgress)
    if (error) return { error }

    const recorded = await recordRequestAttachment(target.requestId, storagePath, file.name)
    if ("error" in recorded) return { error: recorded.error }
    return {}
  } catch (err) {
    // A dropped connection mid-upload lands here rather than in `error`.
    return {
      error: err instanceof Error ? humanizeStorageError(err.message) : "Upload failed. Try again."
    }
  }
}

/**
 * Uploads a staged batch once the request it belongs to finally exists.
 *
 * Sequential, not parallel: these are 10 MB files on church wifi, and five at
 * once is how you get five timeouts instead of five uploads.
 *
 * Returns one message per file that failed. The caller decides how loud to be —
 * on the create forms the request itself has already been saved by this point,
 * so a failed attachment is a warning, not a lost submission.
 */
export async function uploadStagedAttachments(
  files: File[],
  target: UploadTarget
): Promise<string[]> {
  const failures: string[] = []
  for (const file of files) {
    const { error } = await uploadAttachment(file, target)
    if (error) failures.push(error)
  }
  return failures
}
