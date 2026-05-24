"use client"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/form-field"
import { AlertCircle, ArrowRight, MailCheck, ArrowLeft } from "lucide-react"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (resetError) {
      setError(resetError.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-subtle border border-border text-success">
          <MailCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Check your email</h1>
        <p className="mt-2 text-[13.5px] text-muted leading-relaxed">
          If an account exists for{" "}
          <strong className="font-medium text-foreground">{email}</strong>, we&apos;ve sent a
          link to reset the password.
        </p>
        <Link href="/login" className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Forgot password</h1>
        <p className="text-[13.5px] text-muted mt-1.5">
          Enter the email tied to your account. We&apos;ll send a reset link.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            autoComplete="email"
          />
        </FormField>

        <Button type="submit" loading={loading} fullWidth size="lg" className="mt-1">
          {loading ? "Sending…" : (
            <>
              Send reset link
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-7 text-center text-[13px] text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-foreground hover:text-primary transition-colors underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
