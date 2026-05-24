"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/form-field"
import { AlertCircle, CheckCircle2 } from "lucide-react"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
    setTimeout(() => router.push("/login?message=Password+reset.+Sign+in+to+continue."), 2000)
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-success-soft border border-success/20 text-success">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Password updated</h1>
        <p className="mt-2 text-[13.5px] text-muted leading-relaxed">
          Redirecting you to sign in…
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Set a new password</h1>
        <p className="text-[13.5px] text-muted mt-1.5">
          Choose a password you&apos;ll remember. At least 8 characters.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="New password" required>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={8}
            required
            autoFocus
            autoComplete="new-password"
          />
        </FormField>
        <FormField label="Confirm password" required>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            minLength={8}
            required
            autoComplete="new-password"
          />
        </FormField>

        <Button type="submit" loading={loading} fullWidth size="lg" className="mt-1">
          {loading ? "Updating…" : "Update password"}
        </Button>
      </form>
    </div>
  )
}
