import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Routes reachable without an account.
 *
 * Everything else redirects to /login. These are the deliberate exceptions: the
 * sign-in screens, and the three surfaces built to be handed to someone outside the
 * team — a request form on a public link, a tracking page for a submitted request,
 * and a read-only live run sheet on a screen at the desk.
 *
 * Each of the last three carries its own unguessable token and reads through the
 * service-role client, since RLS grants nothing to an anonymous caller. The token is
 * the gate; this list only stops the redirect from firing before the page can check it.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/sign-up",
  "/auth",
  "/request/public",
  "/request/track",
  "/live",
  "/scan"
] as const

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPublic = PUBLIC_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix)
  )

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
