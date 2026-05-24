"use client"

import { useState, useEffect } from "react"
import { Sparkles, Inbox, CalendarCheck, Users, ArrowRight } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { markUserOnboarded } from "@/server/actions/join-requests"

interface WelcomeModalProps {
  /** User's full name (or null) for the greeting. */
  name: string | null
  /** Pass `true` for users with users.onboarded_at == null. */
  shouldShow: boolean
}

/**
 * Lightweight first-login welcome. Shown ONCE per user, gated by
 * users.onboarded_at. Dismissing marks them onboarded so we won't re-prompt.
 *
 * Restraint: this isn't a tour. One screen, three highlights, one CTA.
 */
export function WelcomeModal({ name, shouldShow }: WelcomeModalProps) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)

  // Delay open by a tick so the dashboard mounts behind it cleanly.
  useEffect(() => {
    if (!shouldShow) return
    const t = setTimeout(() => setOpen(true), 200)
    return () => clearTimeout(t)
  }, [shouldShow])

  async function dismiss() {
    if (closing) return
    setClosing(true)
    setOpen(false)
    // Fire-and-forget; if it fails we'll just show the modal again on next visit.
    void markUserOnboarded()
  }

  const firstName = (name ?? "").split(" ")[0] || "there"

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title={`Welcome, ${firstName}.`}
      description="A two-minute orientation so the first week feels easy."
      size="default"
      footer={
        <Button onClick={dismiss}>
          Get started
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      }
    >
      <div className="space-y-1 py-1">
        <Highlight
          icon={<Inbox />}
          title="Submit & track requests"
          body="Need a video, design, or sound support? Submit a request and route it to the right sub-team."
        />
        <Highlight
          icon={<CalendarCheck />}
          title="See what you're scheduled for"
          body="Your assignments appear on the dashboard. Confirm or decline so the lead can plan."
        />
        <Highlight
          icon={<Users />}
          title="Join a sub-team"
          body="Pick the sub-teams you serve in. A lead will approve, then you'll see their work."
        />
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-surface-subtle/60 px-3 py-2.5">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <p className="text-[12.5px] text-muted leading-snug">
          Press <kbd className="font-mono text-[11px] border border-border bg-surface rounded px-1 py-0.5">⌘K</kbd> any time
          to search, jump to a page, or create something new.
        </p>
      </div>
    </Modal>
  )
}

function Highlight({
  icon, title, body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-faint [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-foreground">{title}</p>
        <p className="text-[12.5px] text-muted leading-snug mt-0.5">{body}</p>
      </div>
    </div>
  )
}
