"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENTS_PER_REQUEST,
  MAX_ATTACHMENT_BYTES,
  buildStoragePath,
  formatBytes,
  isAllowedMimeType,
  ALLOWED_TYPES_LABEL
} from "@/lib/attachments"
import type { AttachmentActionResult, RequestAttachment } from "@/lib/attachments"
import { getPublicLinkByToken } from "@/server/actions/public-requests"

/**
 * The cookie-bound client's type, reused for the service-role client.
 *
 * Neither client is generated against a schema in this repo, so `createClient()`
 * types every table permissively while `createServiceClient()` types them as
 * `never`. Borrowing the former's type is what lets one `guardCapacity` serve
 * both paths instead of two near-identical copies. Only the types are shared —
 * `adminClient()` still returns the real service-role client.
 */
type AppClient = Awaited<ReturnType<typeof createClient>>

function adminClient(): AppClient {
  return createAdminClient() as unknown as AppClient
}

/** How long a download link stays good for. Long enough to read, short enough to leak harmlessly. */
const SIGNED_URL_TTL_SECONDS = 60 * 60

interface StoredRow {
  id: string
  request_id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  uploaded_by: string | null
  created_at: string
  users?: { full_name: string | null } | { full_name: string | null }[] | null
}

/**
 * The bucket is private, so a row on its own is not viewable. Every read mints a
 * short-lived signed URL alongside it — that is the only way the bytes are ever
 * reachable, and it expires.
 */
async function withSignedUrls(
  rows: StoredRow[],
  sign: (paths: string[]) => Promise<Map<string, string>>
): Promise<RequestAttachment[]> {
  const urls = rows.length > 0 ? await sign(rows.map((r) => r.storage_path)) : new Map<string, string>()
  return rows.map((row) => {
    const rawUser = row.users
    const user = Array.isArray(rawUser) ? rawUser[0] : rawUser
    return {
      id: row.id,
      request_id: row.request_id,
      storage_path: row.storage_path,
      file_name: row.file_name,
      mime_type: row.mime_type,
      size_bytes: Number(row.size_bytes),
      uploaded_by: row.uploaded_by,
      created_at: row.created_at,
      signed_url: urls.get(row.storage_path) ?? null,
      uploaded_by_name: user?.full_name ?? null
    }
  })
}

/**
 * Everything attached to one request, newest last so the list reads in the order
 * things happened.
 *
 * Returns `[]` rather than throwing on failure: an attachment list that cannot
 * load should not take the detail panel down with it.
 */
export async function listRequestAttachments(requestId: string): Promise<RequestAttachment[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("request_attachments")
    .select(
      "id, request_id, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at, users:uploaded_by(full_name)"
    )
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })

  if (error || !data) return []

  return withSignedUrls(data as unknown as StoredRow[], async (paths) => {
    const { data: signed } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
    const map = new Map<string, string>()
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl)
    }
    return map
  })
}

/**
 * Records an object the browser has already put in the bucket.
 *
 * The client tells us *where* it uploaded and what the file was called. It is
 * not asked for the size or the content type, and would not be believed if it
 * offered them — both are read back off the stored object. A client that lies
 * about its own upload can therefore only mislabel the row, never smuggle
 * anything past the bucket's limits.
 */
export async function recordRequestAttachment(
  requestId: string,
  storagePath: string,
  fileName: string
): Promise<AttachmentActionResult> {
  const supabase = await createClient()

  const {
    data: { user: authUser }
  } = await supabase.auth.getUser()
  if (!authUser) return { error: "Sign in before attaching files." }

  // The path is generated client-side, so the one thing that must be checked is
  // that it belongs to the request being written to — otherwise an attachment
  // could be pointed at another request's folder.
  if (!storagePath.startsWith(`${requestId}/`)) {
    return { error: "That file was uploaded to the wrong place. Try attaching it again." }
  }

  const guard = await guardCapacity(supabase, requestId)
  if (guard) return guard

  const meta = await readObject(supabase, storagePath)
  if ("error" in meta) return meta

  const { data: profile } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUser.id)
    .single()

  const { error } = await supabase.from("request_attachments").insert({
    request_id: requestId,
    storage_path: storagePath,
    file_name: fileName.slice(0, 200),
    mime_type: meta.mimeType,
    size_bytes: meta.sizeBytes,
    uploaded_by: profile?.id ?? null
  })

  if (error) {
    // The row failed, so the object is now unreferenced. Clear it rather than
    // leave a file nobody can see and nobody can delete.
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([storagePath])
    return { error: error.message }
  }

  revalidatePath("/requests")
  return { success: true as const }
}

/**
 * Removes the row *and* the object.
 *
 * Storage first would risk a row pointing at nothing if the delete failed
 * halfway; row first would risk an orphaned object. Object first is the lesser
 * evil — an orphan costs storage, a dangling row shows the user a file that
 * 404s when they click it.
 */
export async function deleteRequestAttachment(
  attachmentId: string
): Promise<AttachmentActionResult> {
  const supabase = await createClient()

  const {
    data: { user: authUser }
  } = await supabase.auth.getUser()
  if (!authUser) return { error: "Sign in before removing files." }

  const { data: row, error: readError } = await supabase
    .from("request_attachments")
    .select("id, storage_path")
    .eq("id", attachmentId)
    .single()

  if (readError || !row) return { error: "That attachment no longer exists." }

  const { error: storageError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .remove([row.storage_path as string])
  if (storageError) return { error: `Could not delete the file: ${storageError.message}` }

  const { error } = await supabase.from("request_attachments").delete().eq("id", attachmentId)
  if (error) return { error: error.message }

  revalidatePath("/requests")
  return { success: true as const }
}

// ── Public (unauthenticated) path ─────────────────────────────────────────
//
// A visitor filing through a shared link has no session, so they cannot be given
// write access to the bucket — an anon insert policy would be an open drop box
// for anyone holding the publishable key, which is every visitor.
//
// Instead the flow is: the browser asks the server for permission to upload one
// named file; the server checks the link token, checks the request really came
// through that link, checks the count and the declared type, and only then mints
// a single-use signed upload URL with the service-role key. The key never leaves
// the server; the URL is good for exactly one object key, expires on Storage's
// own schedule, and cannot be reused once spent (`upsert: false`). The bucket's
// size and MIME limits still apply to whatever actually arrives through it.

/**
 * The token check both public entry points share: link must exist, be active,
 * be unexpired, and the request must be one this link produced.
 */
async function verifyPublicClaim(
  token: string,
  requestId: string
): Promise<{ error: string } | { admin: AppClient }> {
  const link = await getPublicLinkByToken(token)
  if (!link) return { error: "This link is no longer accepting submissions." }

  const admin = adminClient()
  const { data: request } = await admin
    .from("requests")
    .select("id, public_request_link_id")
    .eq("id", requestId)
    .single()

  if (!request || request.public_request_link_id !== link.id) {
    return { error: "That request can't be found. Refresh and submit the form again." }
  }

  return { admin }
}

/**
 * Step one of a public upload: ask for a slot.
 *
 * The declared size and type are checked here so a 400 MB video is refused
 * before it is sent. They are *not* trusted — the bucket enforces both again on
 * arrival, and `recordPublicAttachment` reads the real values back off the
 * stored object.
 */
export async function createPublicAttachmentUpload(
  token: string,
  requestId: string,
  fileName: string,
  declaredSize: number,
  declaredMime: string
): Promise<{ error: string } | { success: true; storagePath: string; signedUrl: string }> {
  if (declaredSize > MAX_ATTACHMENT_BYTES) {
    return {
      error: `"${fileName}" is ${formatBytes(declaredSize)}. The limit is ${formatBytes(
        MAX_ATTACHMENT_BYTES
      )}.`
    }
  }
  if (!isAllowedMimeType(declaredMime)) {
    return { error: `That file type can't be attached. Accepted: ${ALLOWED_TYPES_LABEL}.` }
  }

  const claim = await verifyPublicClaim(token, requestId)
  if ("error" in claim) return { error: claim.error }
  const { admin } = claim

  const guard = await guardCapacity(admin, requestId)
  if (guard) return guard

  const storagePath = buildStoragePath(requestId, fileName)
  const { data, error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false })

  if (error || !data) {
    return { error: "Could not start the upload. Please try again." }
  }

  // The absolute URL, not the bare token: the browser PUTs to it over XHR so it
  // can report progress, and `signedUrl` from the SDK is path-only.
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const signedUrl = data.signedUrl.startsWith("http")
    ? data.signedUrl
    : `${base.replace(/\/$/, "")}/storage/v1${data.signedUrl}`

  return { success: true as const, storagePath: data.path, signedUrl }
}

/**
 * Step two of a public upload: record the object that has now landed.
 *
 * Re-validates the token from scratch. The two calls are separate round trips
 * and the link could have been deactivated between them; more to the point, an
 * endpoint that trusts step one having happened is an endpoint that can be
 * called without step one.
 */
export async function recordPublicAttachment(
  token: string,
  requestId: string,
  storagePath: string,
  fileName: string
): Promise<AttachmentActionResult> {
  if (!storagePath.startsWith(`${requestId}/`)) {
    return { error: "That file was uploaded to the wrong place. Try attaching it again." }
  }

  const claim = await verifyPublicClaim(token, requestId)
  if ("error" in claim) return { error: claim.error }
  const { admin } = claim

  const guard = await guardCapacity(admin, requestId)
  if (guard) return guard

  const meta = await readObject(admin, storagePath)
  if ("error" in meta) return meta

  const { error } = await admin.from("request_attachments").insert({
    request_id: requestId,
    storage_path: storagePath,
    file_name: fileName.slice(0, 200),
    mime_type: meta.mimeType,
    size_bytes: meta.sizeBytes,
    uploaded_by: null
  })

  if (error) {
    await admin.storage.from(ATTACHMENT_BUCKET).remove([storagePath])
    return { error: error.message }
  }

  revalidatePath("/requests")
  return { success: true as const }
}

// ── Shared checks ─────────────────────────────────────────────────────────

/** Refuses the upload once a request is carrying its share of files. */
async function guardCapacity(client: AppClient, requestId: string) {
  const { count } = await client
    .from("request_attachments")
    .select("id", { count: "exact", head: true })
    .eq("request_id", requestId)

  if ((count ?? 0) >= MAX_ATTACHMENTS_PER_REQUEST) {
    return {
      error: `This request already has ${MAX_ATTACHMENTS_PER_REQUEST} attachments. Remove one before adding another.`
    }
  }
  return null
}

/**
 * The truth about a stored object, read back from Storage.
 *
 * This is the load-bearing check on both paths. The bucket already refused
 * anything oversized or of the wrong type, so if the object is here at all it is
 * within limits — but reading the values rather than accepting the client's word
 * for them means the row can never disagree with the file.
 */
async function readObject(
  client: AppClient,
  storagePath: string
): Promise<{ sizeBytes: number; mimeType: string } | { error: string }> {
  const { data, error } = await client.storage.from(ATTACHMENT_BUCKET).info(storagePath)

  if (error || !data) {
    return { error: "That file didn't finish uploading. Try attaching it again." }
  }

  const sizeBytes = data.size ?? 0
  const mimeType = data.contentType ?? "application/octet-stream"

  if (sizeBytes <= 0 || sizeBytes > MAX_ATTACHMENT_BYTES) {
    await client.storage.from(ATTACHMENT_BUCKET).remove([storagePath])
    return { error: `Files must be under ${formatBytes(MAX_ATTACHMENT_BYTES)}.` }
  }
  if (!isAllowedMimeType(mimeType)) {
    await client.storage.from(ATTACHMENT_BUCKET).remove([storagePath])
    return { error: `That file type can't be attached. Accepted: ${ALLOWED_TYPES_LABEL}.` }
  }

  return { sizeBytes, mimeType }
}
