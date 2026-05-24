import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  // Supabase sets `type` on invite/recovery links (`invite`, `recovery`,
  // `email_change`, `signup`). Invitees should land on /set-password so
  // they can set their first password.
  const type = searchParams.get("type")
  const next = searchParams.get("next") ?? "/dashboard"

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Invite or password-recovery flows always go to /set-password.
      if (type === "invite" || type === "recovery") {
        return NextResponse.redirect(`${origin}/set-password`)
      }
      // For normal sign-in/verify flows: pending users → /pending,
      // active users → requested destination.
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        const { data: profile } = await supabase
          .from("users").select("status, invited_at, accepted_invite_at").eq("auth_user_id", authUser.id).maybeSingle()
        // Invited user landing without explicit type → also route to set-password
        if (profile?.invited_at && !profile?.accepted_invite_at) {
          return NextResponse.redirect(`${origin}/set-password`)
        }
        if (profile?.status === "pending") {
          return NextResponse.redirect(`${origin}/pending`)
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
