"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

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

export function PendingUsersList({
  users,
  roles,
}: {
  users: PendingUser[]
  roles: Role[]
}) {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<Record<string, string>>({})

  async function approveUser(userId: string) {
    const supabase = createClient()
    const roleId = selectedRole[userId]

    if (!roleId) {
      alert("Please select a role before approving")
      return
    }

    const { error } = await supabase
      .from("users")
      .update({ status: "active" })
      .eq("id", userId)

    if (error) {
      alert(error.message)
      return
    }

    const user = users.find((u) => u.id === userId)
    const membershipId = user?.campus_memberships?.[0]?.id

    if (membershipId) {
      await supabase
        .from("campus_memberships")
        .update({ role_id: roleId, status: "active" })
        .eq("id", membershipId)
    }

    router.refresh()
  }

  async function rejectUser(userId: string) {
    const supabase = createClient()
    await supabase.from("users").update({ status: "suspended" }).eq("id", userId)
    router.refresh()
  }

  if (users.length === 0) return null

  return (
    <div className="rounded-lg border bg-surface p-6">
      <h2 className="font-semibold mb-4">Pending Approvals ({users.length})</h2>
      <div className="space-y-4">
        {users.map((user) => (
          <div key={user.id} className="flex items-center justify-between rounded-md border p-4">
            <div>
              <p className="font-medium text-sm">{user.full_name}</p>
              <p className="text-sm text-muted">{user.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                className="rounded-md border border bg-canvas px-3 py-1.5 text-sm"
                value={selectedRole[user.id] ?? ""}
                onChange={(e) =>
                  setSelectedRole((prev) => ({ ...prev, [user.id]: e.target.value }))
                }
              >
                <option value="">Select role...</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={() => approveUser(user.id)}>
                Approve
              </Button>
              <Button size="sm" variant="secondary" onClick={() => rejectUser(user.id)}>
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
