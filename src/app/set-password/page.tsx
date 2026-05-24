import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { SetPasswordClient } from "./set-password-client"

export const dynamic = "force-dynamic"

/**
 * Where invitees land after clicking the magic link in their invitation
 * email. The auth callback exchanges the code for a session, so by the
 * time we reach this page the user is authenticated but has no password
 * yet. They set one here, then enter the app.
 *
 * Re-used for normal logged-in users who want to set/change their
 * password too — anyone with an active session can use this page.
 */
export default async function SetPasswordPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect("/login?message=Your+invitation+link+has+expired.+Ask+for+a+new+one.")

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email, accepted_invite_at")
    .eq("auth_user_id", authUser.id)
    .maybeSingle()

  return (
    <SetPasswordClient
      email={profile?.email ?? authUser.email ?? null}
      name={profile?.full_name ?? null}
      isInviteAcceptance={!profile?.accepted_invite_at}
    />
  )
}
