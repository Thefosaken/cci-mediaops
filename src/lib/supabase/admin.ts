import "server-only"
import { createClient as createServiceClient } from "@supabase/supabase-js"

/**
 * Service-role Supabase client.
 *
 * Has full DB access AND can call `auth.admin.*` (inviteUserByEmail,
 * generateLink, deleteUser, etc). NEVER use this in code that's reachable
 * by the browser — keep it in server actions and route handlers only.
 *
 * Required env var (Vercel → Settings → Environment Variables, Production):
 *   SUPABASE_SERVICE_ROLE_KEY  — from Supabase Dashboard → Project Settings
 *                                → API → service_role (the long key)
 */
let cached: ReturnType<typeof createServiceClient> | null = null

export function createAdminClient() {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      "Supabase service-role client is not configured. Set SUPABASE_SERVICE_ROLE_KEY."
    )
  }
  cached = createServiceClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return cached
}

export function adminClientConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}
