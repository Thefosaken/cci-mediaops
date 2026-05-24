"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { EmptyState } from "@/components/ui/empty-state"
import { useToast } from "@/lib/toast/toast-context"
import { createClient } from "@/lib/supabase/client"
import { UserCheck } from "lucide-react"

interface PendingUser {
  id: string
  full_name: string
  email: string
  campus_memberships: { id: string }[]
}

interface Role {
  id: string
  name: string
  description: string | null
}

function UserInitials({ name }: { name: string }) {
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle border border-border text-xs font-semibold text-muted select-none">
      {initials}
    </div>
  )
}

export function PendingUsersList({ users, roles }: { users: PendingUser[]; roles: Role[] }) {
  const router = useRouter()
  const { success, error: showError, warning } = useToast()
  const [selectedRole, setSelectedRole] = useState<Record<string, string>>({})

  const roleOptions = [
    { value: "", label: "Select role…" },
    ...roles.map((r) => ({ value: r.id, label: r.name.replace(/_/g, " ") })),
  ]

  async function approveUser(userId: string) {
    const roleId = selectedRole[userId]
    if (!roleId) {
      warning("Please select a role before approving.")
      return
    }

    const supabase = createClient()
    const { error } = await supabase.from("users").update({ status: "active" }).eq("id", userId)
    if (error) { showError(error.message); return }

    const user = users.find((u) => u.id === userId)
    const membershipId = user?.campus_memberships?.[0]?.id
    if (membershipId) {
      await supabase.from("campus_memberships").update({ role_id: roleId, status: "active" }).eq("id", membershipId)
    }

    success("User approved and activated.")
    router.refresh()
  }

  async function rejectUser(userId: string) {
    const supabase = createClient()
    await supabase.from("users").update({ status: "suspended" }).eq("id", userId)
    success("User rejected.")
    router.refresh()
  }

  if (users.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <p className="text-[13px] font-semibold text-foreground">Pending Users</p>
        <span className="inline-flex items-center rounded-md bg-warning-soft text-warning border border-warning/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
          {users.length}
        </span>
      </div>
      <div className="p-5 space-y-3">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border bg-canvas px-4 py-3"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <UserInitials name={user.full_name ?? "?"} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user.full_name}</p>
                <p className="text-xs text-faint truncate">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-40">
                <Select
                  value={selectedRole[user.id] ?? ""}
                  onChange={(v) => setSelectedRole((p) => ({ ...p, [user.id]: v }))}
                  options={roleOptions}
                  aria-label={`Role for ${user.full_name}`}
                />
              </div>
              <Button size="sm" onClick={() => approveUser(user.id)}>Approve</Button>
              <Button size="sm" variant="secondary" onClick={() => rejectUser(user.id)}>Reject</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
