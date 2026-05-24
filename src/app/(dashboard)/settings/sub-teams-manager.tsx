"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/form-field"
import { useToast } from "@/lib/toast/toast-context"
import { createClient } from "@/lib/supabase/client"
import { Users, Plus } from "lucide-react"
import { cn } from "@/lib/utils/cn"

interface SubTeam {
  id: string
  name: string
  description: string | null
  status: string
}

export function SubTeamsManager({ subTeams }: { subTeams: SubTeam[] }) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [loading, setLoading] = useState(false)

  async function addSubTeam() {
    if (!newName.trim()) return
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
      if (!campus) throw new Error("No campus")

      const { error } = await supabase.from("sub_teams").insert({
        campus_id: campus.id,
        name: newName.trim(),
        description: newDesc.trim() || null,
      })
      if (error) throw error
      setNewName("")
      setNewDesc("")
      success("Sub-team created.")
      router.refresh()
    } catch { showError("Failed to create sub-team.") }
    finally { setLoading(false) }
  }

  async function toggleStatus(id: string, currentStatus: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from("sub_teams")
      .update({ status: currentStatus === "active" ? "inactive" : "active" })
      .eq("id", id)
    if (error) showError("Failed to update status.")
    else router.refresh()
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-[13px] font-semibold text-foreground">Sub-Teams</p>
        <p className="text-xs text-faint">{subTeams.length} teams configured</p>
      </div>
      <div className="p-5 space-y-4">
        {/* Add form */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Team name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubTeam() } }}
            className="sm:max-w-[200px]"
          />
          <Input
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={addSubTeam}
            loading={loading}
            disabled={loading || !newName.trim()}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {/* Team list */}
        {subTeams.length === 0 ? (
          <EmptyState icon={<Users className="h-4 w-4" />} title="No sub-teams yet" description="Add your first team above." className="py-8" />
        ) : (
          <ul className="space-y-1.5">
            {subTeams.map((team) => (
              <li
                key={team.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-canvas px-4 py-3 hover:border-border-strong transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{team.name}</p>
                  {team.description && (
                    <p className="text-xs text-faint truncate">{team.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleStatus(team.id, team.status)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                    team.status === "active"
                      ? "bg-success-soft text-success border border-success/20 hover:bg-danger-soft hover:text-danger hover:border-danger/20"
                      : "bg-surface-subtle text-faint border border-border hover:bg-success-soft hover:text-success hover:border-success/20"
                  )}
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    team.status === "active" ? "bg-success" : "bg-faint"
                  )} aria-hidden="true" />
                  {team.status === "active" ? "Active" : "Inactive"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
