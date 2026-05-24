import "server-only"
import { Resend } from "resend"

/**
 * Resend client. If RESEND_API_KEY isn't configured, every send becomes a no-op
 * (logged in dev). This lets the rest of the app work in environments without
 * email — local previews, missing-key states — without throwing.
 */
const apiKey = process.env.RESEND_API_KEY
const resend = apiKey ? new Resend(apiKey) : null

const FROM = process.env.RESEND_FROM ?? "CCI MediaOps <onboarding@resend.dev>"
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://cci-mediaops.vercel.app"

interface SendEmailInput {
  to: string | string[]
  subject: string
  /** Pre-rendered HTML body. */
  html: string
  /** Plain-text fallback. */
  text?: string
  /** Optional reply-to override. */
  replyTo?: string
}

export async function sendEmail(input: SendEmailInput): Promise<
  { ok: true; id?: string } | { ok: false; error: string }
> {
  if (!resend) {
    console.warn(
      "[email] RESEND_API_KEY not set — skipping send to",
      input.to,
      "subject:",
      input.subject
    )
    return { ok: true, id: undefined }
  }
  try {
    const res = await resend.emails.send({
      from: FROM,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    })
    if (res.error) return { ok: false, error: res.error.message }
    return { ok: true, id: res.data?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown email error"
    console.error("[email] send failed:", msg)
    return { ok: false, error: msg }
  }
}

export { APP_URL }
