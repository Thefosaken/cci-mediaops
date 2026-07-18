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

  /**
   * A lead or member sees their own team's name in the sidebar instead of the
   * structural label. Only resolved when they belong to exactly one team — with
   * several, no single name is truthful and "Sub-Teams" is the honest label again.
   */
  const { data: myTeams } = await supabase
    .from("sub_team_memberships")
    .select("sub_teams(name)")
    .eq("user_id", user.id)
    .eq("status", "active")

  const myTeamName =
    myTeams?.length === 1
      ? ((myTeams[0] as unknown as { sub_teams?: { name?: string } }).sub_teams?.name ?? null)
      : null

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
      myTeamName={myTeamName}
    >
      {children}
    </Shell>
  )
}
