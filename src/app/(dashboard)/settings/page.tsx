import { requireAuth, getCurrentUserWithRole } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { PendingUsersList } from "./pending-users-list"
import { SubTeamsManager } from "./sub-teams-manager"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Users } from "lucide-react"
import { cn } from "@/lib/utils/cn"

function UserInitials({ name }: { name: string }) {
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle border border-border text-xs font-semibold text-muted select-none">
      {initials}
    </div>
  )
}

export default async function SettingsPage() {
  const user         = await requireAuth()
  const userWithRole = await getCurrentUserWithRole()
  const roleName     = userWithRole?.campus_memberships?.[0]?.roles?.name
  const isAdmin      = roleName === "super_admin" || roleName === "media_admin"

  const supabase = await createClient()

  const { data: pendingUsers } = await supabase
    .from("users").select("*, campus_memberships(*)").eq("status", "pending")

  const { data: activeUsers } = await supabase
    .from("users").select("*, campus_memberships(*)").eq("status", "active")

  const { data: subTeams } = await supabase
    .from("sub_teams").select("*").eq("status", "active")

  const { data: roles } = await supabase.from("roles").select("*")

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted mt-0.5">System configuration and team management</p>
      </div>

      {/* Admin sections */}
      {isAdmin && (
        <>
          <PendingUsersList users={pendingUsers ?? []} roles={roles ?? []} />
          <SubTeamsManager subTeams={subTeams ?? []} />
        </>
      )}

      {/* Active team members */}
      <div className="rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Active Members</p>
            <p className="text-xs text-faint">{activeUsers?.length ?? 0} people</p>
          </div>
        </div>
        <div className="p-5">
          {!activeUsers?.length ? (
            <EmptyState icon={<Users className="h-5 w-5" />} title="No active members" description="Approve pending users to see them here." className="py-8" />
          ) : (
            <ul className="divide-y divide-border -my-1">
              {activeUsers.map((u) => {
                const role = roles?.find((r) => r.id === u.campus_memberships?.[0]?.role_id)
                return (
                  <li key={u.id} className="flex items-center gap-3 py-3 group hover:bg-surface-subtle -mx-5 px-5 rounded-lg transition-colors">
                    <UserInitials name={u.full_name ?? "?"} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{u.full_name}</p>
                      <p className="text-xs text-faint truncate">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {role && (
                        <span className="hidden sm:inline-flex items-center rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[10px] font-medium text-muted capitalize">
                          {role.name.replace(/_/g, " ")}
                        </span>
                      )}
                      <Badge variant="success" dot>Active</Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
