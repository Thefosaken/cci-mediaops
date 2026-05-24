import { Suspense } from "react"
import { requireAuth, getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { SettingsPageClient } from "./settings-page-client"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const user = await requireAuth()
  const userWithRole = await getCurrentUserWithRole()
  const roleName = (userWithRole as unknown as { campus_memberships?: { roles?: { name?: string } }[] } | null)
    ?.campus_memberships?.[0]?.roles?.name
  const isAdmin = roleName === "super_admin" || roleName === "media_admin"

  const supabase = await createClient()

  const [pendingRes, activeRes, subTeamsRes, rolesRes, campusRes] = await Promise.all([
    supabase.from("users").select("*, campus_memberships(id, role_id, status)").eq("status", "pending"),
    supabase.from("users").select("*, campus_memberships(id, role_id, status)").eq("status", "active").order("full_name"),
    supabase.from("sub_teams").select("*").order("name"),
    supabase.from("roles").select("*").order("name"),
    supabase.from("campuses").select("*").limit(1).maybeSingle(),
  ])

  return (
    <Suspense>
      <SettingsPageClient
        currentUser={user}
        roleName={roleName ?? null}
        isAdmin={isAdmin}
        pendingUsers={pendingRes.data ?? []}
        activeUsers={activeRes.data ?? []}
        subTeams={subTeamsRes.data ?? []}
        roles={rolesRes.data ?? []}
        campus={campusRes.data ?? null}
      />
    </Suspense>
  )
}
