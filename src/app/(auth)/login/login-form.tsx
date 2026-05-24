"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LogIn } from "lucide-react"

export function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

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
      setError("Your account is pending approval. An admin will activate your account shortly.")
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
    <div className="w-full max-w-[400px]">
      <div className="bg-surface border border-border-subtle rounded-2xl p-8 shadow-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1.5">Welcome back</h1>
          <p className="text-sm text-muted">Sign in to your account</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-5">
          {searchParams.get("message") && (
            <div className="bg-surface-subtle text-foreground text-sm rounded-lg p-3 text-center border border-border-subtle">
              {searchParams.get("message")}
            </div>
          )}
          {error && (
            <div className="bg-danger/10 text-danger text-sm rounded-lg p-3 border border-danger/20 flex items-start gap-2">
              <span className="shrink-0 font-medium">!</span>
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground/80">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="rounded-lg h-10 transition-shadow focus:ring-2 focus:ring-border-strong border-border-subtle"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-foreground/80">Password</Label>
                <Link href="#" className="text-xs text-muted hover:text-foreground transition-colors">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="rounded-lg h-10 transition-shadow focus:ring-2 focus:ring-border-strong border-border-subtle"
              />
            </div>
          </div>

          <Button type="submit" className="w-full rounded-md h-10 font-medium transition-transform active:scale-[0.98]" disabled={loading}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        <div className="mt-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-border-subtle" />
          <span className="text-xs text-muted font-medium uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-border-subtle" />
        </div>

        <div className="mt-6">
          <Button variant="secondary" type="button" className="w-full rounded-md h-10 text-foreground border border-border-subtle hover:bg-surface-subtle transition-colors">
            Sign in with GitHub
          </Button>
        </div>
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="font-medium text-foreground hover:underline underline-offset-4 transition-all">
          Sign up
        </Link>
      </p>
    </div>
  )
}
