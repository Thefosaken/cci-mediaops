import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { ShieldCheck, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SignUpForm } from "./signup-form"

export const dynamic = "force-dynamic"

/**
 * Sign-up is allowed only when no users exist yet — that account becomes
 * the super_admin and bootstraps the org/campus/sub-teams.
 *
 * Once there's at least one user, sign-up is invite-only: this page shows
 * a friendly "ask an admin for an invite" message and routes back to login.
 */
export default async function SignUpPage() {
  const supabase = await createClient()
  const { count } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })

  const isFirstUserBootstrap = (count ?? 0) === 0

  if (!isFirstUserBootstrap) {
    return (
      <div>
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface-subtle px-2.5 py-1">
          <ShieldCheck className="h-3 w-3 text-faint" />
          <span className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
            Invite-only
          </span>
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          You need an invitation
        </h1>
        <p className="mt-2 text-[13.5px] text-muted leading-relaxed">
          CCI MediaOps is invite-only. Ask a media admin to send you an invite —
          they can do it from <span className="font-medium text-foreground">Settings → Users & access</span>.
          You'll get an email with a link to set your password.
        </p>

        <div className="mt-6 rounded-lg border border-border bg-surface-subtle/60 px-3 py-3">
          <div className="flex items-start gap-2.5">
            <Mail className="h-3.5 w-3.5 text-faint shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-muted leading-snug">
              Already got an invitation email? Click the link in that email instead of
              signing up here.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Link href="/login">
            <Button variant="primary" fullWidth size="lg">Go to sign in</Button>
          </Link>
        </div>
      </div>
    )
  }

  return <SignUpForm />
}
