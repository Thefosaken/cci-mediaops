"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/form-field"
import { AlertCircle, ArrowRight, MailCheck, Sparkles } from "lucide-react"

/**
 * First-user bootstrap form. Only rendered by sign-up/page.tsx when the
 * users table is empty. The new account becomes super_admin automatically
 * via the handle_new_auth_user trigger.
 */
export function SignUpForm() {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone: phone || undefined },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-subtle border border-border text-success">
          <MailCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Check your email</h1>
        <p className="mt-2 text-[13.5px] text-muted leading-relaxed">
          We sent a confirmation link to{" "}
          <strong className="font-medium text-foreground">{email}</strong>. Click it to
          finish setting up your super-admin account.
        </p>
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          className="mt-6"
          onClick={() => router.push("/login")}
        >
          Back to sign in
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-2.5 py-1">
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-primary">
          First sign-up
        </span>
      </div>
      <div className="mb-7 mt-3">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Set up your campus</h1>
        <p className="text-[13.5px] text-muted mt-1.5">
          You'll become the super admin and can invite the rest of the team afterward.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSignUp} className="space-y-4">
        <FormField label="Full name" required>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            required
            autoFocus
            autoComplete="name"
          />
        </FormField>
        <FormField label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </FormField>
        <FormField label="Phone" helper="Optional — used for high-priority service alerts">
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+234 800 000 0000"
            autoComplete="tel"
          />
        </FormField>
        <FormField label="Password" required helper="At least 8 characters">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={8}
            required
            autoComplete="new-password"
          />
        </FormField>

        <Button type="submit" loading={loading} fullWidth size="lg" className="mt-1">
          {loading ? "Creating account…" : (
            <>
              Create super-admin account
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-7 text-center text-[13px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground hover:text-primary transition-colors underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
