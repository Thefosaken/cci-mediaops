import { requireAuth, getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { PendingUsersList } from "./pending-users-list"
import { SubTeamsManager } from "./sub-teams-manager"

export default async function SettingsPage() {
  const user = await requireAuth()
  const userWithRole = await getCurrentUserWithRole()
  const roleName = userWithRole?.campus_memberships?.[0]?.roles?.name

  const isAdmin = roleName === "super_admin" || roleName === "media_admin"

  const supabase = await createClient()
  const { data: pendingUsers } = await supabase
    .from("users")
    .select("*, campus_memberships(*)")
    .eq("status", "pending")

  const { data: activeUsers } = await supabase
    .from("users")
    .select("*, campus_memberships(*)")
    .eq("status", "active")

  const { data: subTeams } = await supabase
    .from("sub_teams")
    .select("*")
    .eq("status", "active")

  const { data: roles } = await supabase
    .from("roles")
    .select("*")

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">System configuration</p>
      </div>

      {isAdmin && (
        <>
          <PendingUsersList users={pendingUsers ?? []} roles={roles ?? []} />
          <SubTeamsManager subTeams={subTeams ?? []} />
        </>
      )}

      <div className="rounded-lg border bg-card p-6">
        <h2 className="font-semibold mb-4">Active Team Members</h2>
        {(!activeUsers || activeUsers.length === 0) ? (
          <p className="text-sm text-muted-foreground">No active members</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">Role</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeUsers.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-3">{u.full_name}</td>
                    <td className="py-3 text-muted-foreground">{u.email}</td>
                    <td className="py-3 capitalize">
                      {u.campus_memberships?.[0]?.role_id
                        ? roles?.find((r) => r.id === u.campus_memberships[0].role_id)?.name?.replace(/_/g, " ")
                        : "—"}
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
