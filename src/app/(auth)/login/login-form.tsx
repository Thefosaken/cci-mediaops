"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <form onSubmit={handleSignIn}>
        <CardContent className="space-y-4">
          {searchParams.get("message") && (
            <p className="text-sm text-muted bg-surface-subtle rounded-lg px-3 py-2">
              {searchParams.get("message")}
            </p>
          )}
          {error && (
            <p className="text-sm text-danger bg-danger-soft rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading} size="lg">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Signing in...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <LogIn className="h-4 w-4" />
                Sign In
              </span>
            )}
          </Button>
          <p className="text-sm text-muted text-center">
            Don&apos;t have an account?{" "}
            <Link href="/sign-up" className="font-medium text-primary hover:text-primary-dark transition-colors">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
