import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PendingClient } from "./pending-client"

export const dynamic = "force-dynamic"

/**
 * Shown to authenticated users whose account is still `status = 'pending'`.
 * Has its own URL so admins can share it / users can bookmark it, and so
 * we can route to it from login without depending on the dashboard layout.
 */
export default async function PendingPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("id, full_name, email, status, created_at")
    .eq("auth_user_id", authUser.id)
    .single()

  if (!profile) {
    await supabase.auth.signOut()
    redirect("/login")
  }

  // Already active — kick them to the app.
  if (profile.status === "active") redirect("/dashboard")
  if (profile.status === "suspended" || profile.status === "inactive") {
    await supabase.auth.signOut()
    redirect(`/login?message=Your+account+is+ ${profile.status}.+Please+contact+an+admin.`)
  }

  return (
    <PendingClient
      name={profile.full_name}
      email={profile.email}
      signedUpAt={profile.created_at}
    />
  )
}
