"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { format, formatDistanceToNow } from "date-fns"
import { Clock, LogOut, RefreshCcw, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ui/logo"
import { createClient } from "@/lib/supabase/client"

interface PendingClientProps {
  name: string | null
  email: string | null
  signedUpAt: string
}

/**
 * Calm "awaiting approval" screen. Auto re-checks status when the tab
 * regains focus so the user can just come back to the tab once an admin
 * has approved them — no manual refresh needed.
 */
export function PendingClient({ name, email, signedUpAt }: PendingClientProps) {
  const router = useRouter()
  const [checking, setChecking] = useState(false)

  async function checkStatus() {
    setChecking(true)
    try {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        router.replace("/login")
        return
      }
      const { data: profile } = await supabase
        .from("users").select("status").eq("auth_user_id", authUser.id).single()
      if (profile?.status === "active") {
        router.replace("/dashboard")
      } else {
        // still pending — UI stays the same; flash the check state briefly.
        setTimeout(() => setChecking(false), 400)
        return
      }
    } catch {
      setChecking(false)
    }
  }

  // Auto-recheck when the user returns to the tab. No polling.
  useEffect(() => {
    function onFocus() { void checkStatus() }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace("/login")
  }

  const firstName = (name ?? "").split(" ")[0] || "there"

  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 sm:px-6 h-14">
          <div className="flex items-center gap-2.5">
            <Logo className="h-6 w-auto" />
            <span className="text-[13px] font-semibold text-foreground tracking-tight">MediaOps</span>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-muted hover:text-foreground hover:bg-surface-subtle transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center px-5 py-12 sm:py-20">
        <div className="w-full max-w-[480px]">
          {/* Status badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 mb-5">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-warning opacity-60 animate-ping"></span>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warning"></span>
            </span>
            <span className="text-[11.5px] font-semibold uppercase tracking-wider text-warning">
              Awaiting approval
            </span>
          </div>

          <h1 className="text-[26px] font-semibold tracking-tight text-foreground leading-[1.15]">
            You're almost in, {firstName}.
          </h1>
          <p className="mt-3 text-[14px] text-muted leading-relaxed">
            Your account was created. A media admin needs to approve you before
            you can sign in. They'll be notified shortly — most approvals happen
            the same day.
          </p>

          {/* Detail card */}
          <div className="mt-6 rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
                Account
              </p>
              <p className="mt-1 text-[14px] font-medium text-foreground">{name ?? email}</p>
              <p className="text-[12.5px] text-muted">{email}</p>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-3 bg-surface-subtle/40">
              <div className="flex items-center gap-2 text-[12px] text-faint">
                <Clock className="h-3 w-3" />
                <span className="tabular-nums">
                  Signed up {formatDistanceToNow(new Date(signedUpAt), { addSuffix: true })}
                </span>
              </div>
              <Button
                size="xs"
                variant="ghost"
                onClick={checkStatus}
                loading={checking}
                disabled={checking}
              >
                <RefreshCcw className="h-3 w-3" />
                Check again
              </Button>
            </div>
          </div>

          {/* What's next */}
          <div className="mt-6">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint mb-2">
              What happens next
            </p>
            <ol className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
              <Step
                index={1}
                title="Verify your email"
                description="Click the link we sent (check spam if you don't see it)."
                state="done"
              />
              <Step
                index={2}
                title="Admin approval"
                description="A media admin assigns your role and activates the account."
                state="active"
              />
              <Step
                index={3}
                title="Sign in & set up"
                description="You'll get an email when access is granted."
                state="upcoming"
              />
            </ol>
          </div>

          {/* Footer help */}
          <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-border bg-surface-subtle/50 px-3 py-2.5">
            <MailCheck className="h-3.5 w-3.5 text-faint shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-muted leading-snug">
              We'll email{" "}
              <span className="font-medium text-foreground">{email}</span> when you're approved.
              You can close this tab and come back later.
            </p>
          </div>

          <p className="mt-8 text-center text-[11.5px] text-faint tabular-nums">
            Today · {format(new Date(), "MMM d, h:mm a")}
          </p>
        </div>
      </main>
    </div>
  )
}

function Step({
  index,
  title,
  description,
  state,
}: {
  index: number
  title: string
  description: string
  state: "done" | "active" | "upcoming"
}) {
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span
        className={
          state === "done"
            ? "flex h-5 w-5 items-center justify-center rounded-full bg-success text-white text-[10px] font-semibold shrink-0 mt-0.5"
            : state === "active"
            ? "flex h-5 w-5 items-center justify-center rounded-full border-2 border-warning text-warning text-[10px] font-semibold shrink-0 mt-0.5"
            : "flex h-5 w-5 items-center justify-center rounded-full border border-border text-faint text-[10px] font-semibold shrink-0 mt-0.5"
        }
      >
        {state === "done" ? "✓" : index}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={
            state === "upcoming"
              ? "text-[13px] text-muted"
              : "text-[13px] font-medium text-foreground"
          }
        >
          {title}
        </p>
        <p className="text-[12px] text-faint mt-0.5">{description}</p>
      </div>
    </li>
  )
}
