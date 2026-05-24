"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, AlertCircle, ArrowRight } from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/form-field"
import { createClient } from "@/lib/supabase/client"

interface SetPasswordClientProps {
  email: string | null
  name: string | null
  isInviteAcceptance: boolean
}

export function SetPasswordClient({ email, name, isInviteAcceptance }: SetPasswordClientProps) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match")
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateErr) {
      setError(updateErr.message)
      return
    }
    setDone(true)
    setTimeout(() => router.replace("/dashboard"), 900)
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-success-soft border border-success/20 text-success">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <h1 className="text-[20px] font-semibold tracking-tight text-foreground">
            You're in
          </h1>
          <p className="mt-2 text-[13.5px] text-muted">Redirecting you to the dashboard…</p>
        </div>
      </Shell>
    )
  }

  const firstName = (name ?? "").split(" ")[0]
  const heading = isInviteAcceptance
    ? firstName
      ? `Welcome, ${firstName}.`
      : "Welcome."
    : "Set a new password"

  return (
    <Shell>
      <div className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{heading}</h1>
        <p className="text-[13.5px] text-muted mt-1.5">
          {isInviteAcceptance
            ? "Choose a password to finish setting up your account."
            : "Pick a new password. At least 8 characters."}
        </p>
      </div>

      {email && (
        <div className="mb-4 rounded-lg border border-border bg-surface-subtle/60 px-3 py-2.5">
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
            Account
          </p>
          <p className="text-[13px] text-foreground mt-0.5">{email}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <FormField label="New password" required helper="At least 8 characters">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoFocus
            autoComplete="new-password"
          />
        </FormField>
        <FormField label="Confirm password" required>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
          />
        </FormField>
        <Button type="submit" loading={loading} fullWidth size="lg" className="mt-1">
          {loading ? "Saving…" : (
            <>
              {isInviteAcceptance ? "Set password and enter" : "Update password"}
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </form>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl flex items-center gap-2.5 px-5 sm:px-6 h-14">
          <Logo className="h-6 w-auto" />
          <span className="text-[13px] font-semibold text-foreground tracking-tight">MediaOps</span>
        </div>
      </header>
      <main className="flex-1 flex items-start justify-center px-5 py-12 sm:py-16">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
    </div>
  )
}
