"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

interface SubTeam {
  id: string
  name: string
  description: string | null
  status: string
}

export function SubTeamsManager({ subTeams }: { subTeams: SubTeam[] }) {
  const router = useRouter()
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")

  async function addSubTeam() {
    if (!newName.trim()) return
    const supabase = createClient()

    const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
    if (!campus) return

    await supabase.from("sub_teams").insert({
      campus_id: campus.id,
      name: newName.trim(),
      description: newDesc.trim() || null,
    })

    setNewName("")
    setNewDesc("")
    router.refresh()
  }

  async function toggleStatus(id: string, currentStatus: string) {
    const supabase = createClient()
    await supabase
      .from("sub_teams")
      .update({ status: currentStatus === "active" ? "inactive" : "active" })
      .eq("id", id)
    router.refresh()
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="font-semibold mb-4">Sub-Teams</h2>

      <div className="flex gap-3 mb-6">
        <Input
          placeholder="Team name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="max-w-xs"
        />
        <Input
          placeholder="Description (optional)"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={addSubTeam}>Add</Button>
      </div>

      <div className="space-y-2">
        {subTeams.map((team) => (
          <div key={team.id} className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">{team.name}</p>
              {team.description && (
                <p className="text-xs text-muted-foreground">{team.description}</p>
              )}
            </div>
            <Button
              size="sm"
              variant={team.status === "active" ? "outline" : "ghost"}
              onClick={() => toggleStatus(team.id, team.status)}
            >
              {team.status === "active" ? "Active" : "Inactive"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
