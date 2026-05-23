"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface SubTeamMember {
  users: { id: string; full_name: string; email: string } | null
}

interface SubTeamTask {
  id: string
  title: string
  status: string
  assigned_user_id: string | null
}

interface SubTeam {
  id: string
  name: string
  description: string | null
  sub_team_memberships: SubTeamMember[]
  tasks: SubTeamTask[]
}

export function SubTeamsPageClient({
  subTeams,
  allUsers,
  subTeamRequests,
}: {
  subTeams: SubTeam[]
  allUsers: { id: string; full_name: string; email: string }[]
  subTeamRequests: { subTeamId: string; requests: any[] }[]
}) {
  const router = useRouter()
  const [activeTeam, setActiveTeam] = useState<string | null>(
    subTeams[0]?.id ?? null
  )
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskAssignee, setNewTaskAssignee] = useState("")
  const [loading, setLoading] = useState(false)

  const currentTeam = subTeams.find((st) => st.id === activeTeam)
  const currentRequests = subTeamRequests.find(
    (r) => r.subTeamId === activeTeam
  )

  async function addTask() {
    if (!newTaskTitle.trim() || !activeTeam) return
    setLoading(true)
    const supabase = createClient()

    const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
    if (!campus) { setLoading(false); return }

    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("auth_user_id", authUser?.id)
      .single()

    await supabase.from("tasks").insert({
      campus_id: campus.id,
      sub_team_id: activeTeam,
      title: newTaskTitle,
      assigned_user_id: newTaskAssignee || null,
      created_by: user?.id,
    })

    setNewTaskTitle("")
    setNewTaskAssignee("")
    setLoading(false)
    router.refresh()
  }

  async function updateTaskStatus(taskId: string, status: string) {
    const supabase = createClient()
    await supabase.from("tasks").update({ status }).eq("id", taskId)
    router.refresh()
  }

  async function addMember(teamId: string, userId: string) {
    const supabase = createClient()
    const { data: role } = await supabase
      .from("roles")
      .select("id")
      .eq("name", "team_member")
      .single()

    if (role) {
      await supabase.from("sub_team_memberships").insert({
        sub_team_id: teamId,
        user_id: userId,
        role_id: role.id,
      })
    }
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sub-Teams</h1>
        <p className="text-sm text-muted-foreground">Manage each media sub-team</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {subTeams.map((st) => (
          <button
            key={st.id}
            onClick={() => setActiveTeam(st.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTeam === st.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {st.name}
          </button>
        ))}
      </div>

      {currentTeam && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Members</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {currentTeam.sub_team_memberships.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet</p>
              ) : (
                currentTeam.sub_team_memberships.map((m, i) => (
                  <div key={i} className="text-sm">
                    <p className="font-medium">{m.users?.full_name}</p>
                    <p className="text-muted-foreground">{m.users?.email}</p>
                  </div>
                ))
              )}
              <div className="pt-3 border-t">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addMember(currentTeam.id, e.target.value)
                    }
                  }}
                >
                  <option value="">Add member...</option>
                  {allUsers
                    .filter(
                      (u) =>
                        !currentTeam.sub_team_memberships.some(
                          (m) => m.users?.id === u.id
                        )
                    )
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name}
                      </option>
                    ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tasks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="New task..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                />
                <Button size="sm" onClick={addTask} disabled={loading}>
                  Add
                </Button>
              </div>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newTaskAssignee}
                onChange={(e) => setNewTaskAssignee(e.target.value)}
              >
                <option value="">Assign to...</option>
                {currentTeam.sub_team_memberships.map((m) => (
                  <option key={m.users?.id} value={m.users?.id}>
                    {m.users?.full_name}
                  </option>
                ))}
              </select>
              {currentTeam.tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground pt-2">No tasks yet</p>
              ) : (
                <div className="space-y-2 pt-2">
                  {currentTeam.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <p className="text-sm">{task.title}</p>
                      <select
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        value={task.status}
                        onChange={(e) =>
                          updateTaskStatus(task.id, e.target.value)
                        }
                      >
                        <option value="to_do">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="blocked">Blocked</option>
                        <option value="awaiting_review">Awaiting Review</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Assigned Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {currentRequests?.requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No requests assigned</p>
              ) : (
                <div className="space-y-2">
                  {currentRequests?.requests.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                      <span className="font-medium">{r.requests?.title}</span>
                      <span className="text-muted-foreground capitalize">
                        {r.requests?.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
