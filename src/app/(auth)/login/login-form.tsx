"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/form-field"
import { AlertCircle, ArrowRight, Info } from "lucide-react"

export function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const message = searchParams.get("message")

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      setError("Could not verify user")
      setLoading(false)
      return
    }

    const { data: user } = await supabase
      .from("users")
      .select("status, id")
      .eq("auth_user_id", authUser.id)
      .single()

    if (user && user.status === "pending") {
      await supabase.auth.signOut()
      setError("Your account is pending approval. An admin will activate it shortly.")
      setLoading(false)
      return
    }
    if (!user) {
      await supabase.auth.signOut()
      setError("Account not found. Please contact an admin.")
      setLoading(false)
      return
    }

    window.location.href = "/dashboard"
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Sign in</h1>
        <p className="text-[13.5px] text-muted mt-1.5">
          Welcome back. Use your CCI MediaOps account to continue.
        </p>
      </div>

      {message && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-border bg-surface-subtle px-3 py-2.5 text-[13px] text-foreground">
          <Info className="h-4 w-4 text-info shrink-0 mt-0.5" aria-hidden="true" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSignIn} className="space-y-4">
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
        <FormField
          label="Password"
          required
          hint={
            <Link href="/forgot-password" className="text-muted hover:text-foreground transition-colors">
              Forgot password?
            </Link>
          }
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </FormField>

        <Button type="submit" loading={loading} fullWidth size="lg" className="mt-1">
          {loading ? "Signing in…" : (
            <>
              Sign in
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-7 text-center text-[13px] text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="font-medium text-foreground hover:text-primary transition-colors underline-offset-4 hover:underline">
          Request access
        </Link>
      </p>
    </div>
  )
}
