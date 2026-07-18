import { Shell } from "@/components/layout/shell"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { getShellCounts, getRecentNotifications } from "@/server/queries/shell"
import { createClient } from "@/lib/supabase/server"
import { ROLE_LABELS } from "@/constants"
import type { UserRole } from "@/types"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()
  const supabase = await createClient()

  // Fetch counts + notifications + campus context in parallel
  const [counts, notifications, membership] = await Promise.all([
    getShellCounts(user.id),
    getRecentNotifications(user.id),
    supabase
      .from("campus_memberships")
      .select("role_id, roles(name), campus_id, campuses(name)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle()
      .then((r) => r.data),
  ])

  const rawRole = (membership as unknown as { roles?: { name?: string } } | null)?.roles?.name as UserRole | undefined
  const roleLabel = rawRole ? (ROLE_LABELS[rawRole] ?? rawRole) : null
  const campusName = (membership as unknown as { campuses?: { name?: string } } | null)?.campuses?.name

  return (
    <Shell
      counts={counts}
      notifications={notifications}
      userId={user.id}
      userName={user.full_name}
      userEmail={user.email}
      userRole={rawRole}
      userRoleLabel={roleLabel}
      campusName={campusName}
    >
      {children}
    </Shell>
  )
}
