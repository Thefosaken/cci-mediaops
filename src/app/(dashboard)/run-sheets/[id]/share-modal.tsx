"use client"

import { useState } from "react"
import { Check, Copy, Link2, MonitorSmartphone, RefreshCw, ShieldOff } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import { createShareLink, revokeShareLink, rotateShareLink, type ShareExpiry } from "@/server/actions/run-sheets/share"

import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"

/**
 * Hand the live run sheet to a screen that isn't signed in.
 *
 * The tablet at front of house, a phone in the green room, the guest producer's
 * laptop. None of those should need an account on an internal tool, and passing a
 * login around a building is how a team ends up sharing one password forever.
 *
 * The link is a bearer credential and the copy says so plainly rather than burying it.
 * People make sensible decisions about sharing when they are told what they are
 * sharing; they make careless ones when a dialog implies it is safer than it is.
 */

const EXPIRY_OPTIONS: { value: ShareExpiry; label: string; detail: string }[] = [
  { value: "never", label: "No expiry", detail: "Until you turn it off" },
  { value: "24h", label: "24 hours", detail: "Good for one service" },
  { value: "7d", label: "7 days", detail: "Good for a run of them" }
]

export function ShareModal({
  runSheetId,
  existingToken,
  onClose,
  onChanged,
  onError
}: {
  runSheetId: string
  /** The sheet's active link, if it already has one. */
  existingToken: string | null
  onClose: () => void
  onChanged: () => void
  onError: (message: string) => void
}) {
  const [token, setToken] = useState(existingToken)
  const [expiry, setExpiry] = useState<ShareExpiry>("never")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const url = token ? `${window.location.origin}/live/${token}` : null

  const run = async (action: () => Promise<{ error?: string; token?: string }>, after?: (t: string | null) => void) => {
    setBusy(true)
    const res = await action()
    setBusy(false)
    if (res.error) return onError(res.error)
    after?.(res.token ?? null)
    onChanged()
  }

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard access is denied in some embedded browsers. The field is
      // selectable, so the link is still gettable by hand.
      onError("Couldn't copy — select the link and copy it manually")
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Share the live view"
      description="A read-only page for a screen that isn't signed in"
      size="default"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-5">
        {!token ? (
          <>
            <section className="flex items-start gap-3 rounded-md border border-border bg-surface px-3.5 py-3">
              <MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-faint" />
              <p className="text-[12.5px] leading-relaxed text-muted">
                Anyone with the link can read this run sheet and watch it advance live. They
                cannot change anything, and they never see the rest of the app. You can turn
                the link off at any time.
              </p>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Expires
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {EXPIRY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setExpiry(o.value)}
                    className={cn(
                      "rounded-md border px-2.5 py-2 text-left transition-colors duration-150",
                      expiry === o.value
                        ? "border-primary bg-[var(--color-primary-soft)]"
                        : "border-border bg-surface hover:bg-surface-subtle"
                    )}
                  >
                    <span className="block text-[12.5px] font-medium text-foreground">{o.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted">{o.detail}</span>
                  </button>
                ))}
              </div>
            </section>

            <Button
              fullWidth
              loading={busy}
              onClick={() => run(() => createShareLink(runSheetId, { expiry }), setToken)}
            >
              <Link2 className="size-4" />
              Create link
            </Button>
          </>
        ) : (
          <>
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Link
              </h3>
              <div className="flex items-center gap-2">
                {/* Readable and selectable rather than a masked secret — the whole
                    point is to get it onto another device. */}
                <input
                  readOnly
                  value={url ?? ""}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-[12.5px] text-foreground
                             focus-visible:border-border-strong focus-visible:outline-none"
                />
                <Button variant="secondary" onClick={copy}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                Open it on the tablet or paste it into the group chat. The page updates
                itself as the service runs — nobody has to refresh it.
              </p>
            </section>

            <section className="space-y-2 border-t border-border-subtle pt-4">
              <Button
                variant="secondary"
                fullWidth
                loading={busy}
                onClick={() => run(() => rotateShareLink(runSheetId, { expiry }), setToken)}
              >
                <RefreshCw className="size-4" />
                Replace with a new link
              </Button>
              <Button
                variant="ghost"
                fullWidth
                loading={busy}
                onClick={() => run(() => revokeShareLink(runSheetId), () => setToken(null))}
              >
                <ShieldOff className="size-4" />
                Turn off sharing
              </Button>
              <p className="text-[11.5px] leading-relaxed text-muted">
                Replacing kills the old link immediately — use it if the current one has gone
                somewhere it shouldn&apos;t.
              </p>
            </section>
          </>
        )}
      </div>
    </Modal>
  )
}
