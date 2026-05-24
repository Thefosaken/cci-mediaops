"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserPlus, MailCheck } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

export default function SignUpPage() {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone || undefined,
        },
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
      <div className="w-full max-w-[400px]">
        <div className="bg-surface border border-border-subtle rounded-2xl p-8 shadow-sm">
          <EmptyState
            icon={<MailCheck className="h-6 w-6" />}
            title="Check your email"
            description={
              <span>
                We sent a confirmation link to <strong className="text-foreground">{email}</strong>. Please confirm your email address, then sign in.
              </span>
            }
            action={{
              label: "Go to Sign In",
              onClick: () => router.push("/login"),
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="bg-surface border border-border-subtle rounded-2xl p-8 shadow-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1.5">Create an account</h1>
          <p className="text-sm text-muted">Join the CCI Media team</p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-5">
          {error && (
            <div className="bg-danger/10 text-danger text-sm rounded-lg p-3 border border-danger/20 flex items-start gap-2">
              <span className="shrink-0 font-medium">!</span>
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-foreground/80">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Smith"
                required
                autoFocus
                className="rounded-lg h-10 transition-shadow focus:ring-2 focus:ring-border-strong border-border-subtle"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground/80">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="rounded-lg h-10 transition-shadow focus:ring-2 focus:ring-border-strong border-border-subtle"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-foreground/80">Phone <span className="text-muted">(optional)</span></Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234 800 000 0000"
                className="rounded-lg h-10 transition-shadow focus:ring-2 focus:ring-border-strong border-border-subtle"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground/80">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                required
                className="rounded-lg h-10 transition-shadow focus:ring-2 focus:ring-border-strong border-border-subtle"
              />
            </div>
          </div>

          <Button type="submit" className="w-full rounded-md h-10 font-medium transition-transform active:scale-[0.98]" disabled={loading}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                Creating account...
              </span>
            ) : (
              "Create Account"
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
            Sign up with GitHub
          </Button>
        </div>
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline underline-offset-4 transition-all">
          Sign in
        </Link>
      </p>
    </div>
  )
}
