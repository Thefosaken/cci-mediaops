"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { useToast } from "@/lib/toast/toast-context"
import { TASK_STATUSES } from "@/constants"
import { Users, Plus, CheckSquare, Inbox, User } from "lucide-react"
import { cn } from "@/lib/utils/cn"

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

function taskBadgeVariant(status: string) {
  switch (status) {
    case "completed":       return "success" as const
    case "in_progress":     return "info" as const
    case "blocked":         return "danger" as const
    case "awaiting_review": return "warning" as const
    default:                return "muted" as const
  }
}

function reqBadgeVariant(status: string) {
  switch (status) {
    case "completed":   return "success" as const
    case "in_progress": return "info" as const
    case "rejected":    return "danger" as const
    default:            return "warning" as const
  }
}

function UserAvatar({ name }: { name: string }) {
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-subtle border border-border text-[10px] font-semibold text-muted select-none"
      title={name}
    >
      {initials}
    </div>
  )
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
  const { success, error: showError } = useToast()
  const [activeTeam, setActiveTeam] = useState<string | null>(subTeams[0]?.id ?? null)
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskAssignee, setNewTaskAssignee] = useState("")
  const [loading, setLoading] = useState(false)

  const currentTeam = subTeams.find((st) => st.id === activeTeam)
  const currentRequests = subTeamRequests.find((r) => r.subTeamId === activeTeam)

  const taskStatusOptions = [
    { value: "to_do", label: "To Do" },
    { value: "in_progress", label: "In Progress" },
    { value: "blocked", label: "Blocked" },
    { value: "awaiting_review", label: "Awaiting Review" },
    { value: "completed", label: "Completed" },
  ]

  const memberOptions = [
    { value: "", label: "Assign to…" },
    ...(currentTeam?.sub_team_memberships.map((m) => ({
      value: m.users?.id ?? "",
      label: m.users?.full_name ?? "",
    })) ?? []),
  ]

  const addMemberOptions = [
    { value: "", label: "Add member…" },
    ...allUsers
      .filter((u) => !currentTeam?.sub_team_memberships.some((m) => m.users?.id === u.id))
      .map((u) => ({ value: u.id, label: u.full_name, description: u.email })),
  ]

  async function addTask() {
    if (!newTaskTitle.trim() || !activeTeam) return
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
      if (!campus) throw new Error("No campus")

      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: user } = await supabase.from("users").select("id").eq("auth_user_id", authUser?.id).single()

      const { error } = await supabase.from("tasks").insert({
        campus_id: campus.id,
        sub_team_id: activeTeam,
        title: newTaskTitle,
        assigned_user_id: newTaskAssignee || null,
        created_by: user?.id,
      })
      if (error) throw error
      setNewTaskTitle("")
      setNewTaskAssignee("")
      success("Task added.")
      router.refresh()
    } catch { showError("Failed to add task.") }
    finally { setLoading(false) }
  }

  async function updateTaskStatus(taskId: string, status: string) {
    const supabase = createClient()
    await supabase.from("tasks").update({ status }).eq("id", taskId)
    router.refresh()
  }

  async function addMember(userId: string) {
    if (!userId || !activeTeam) return
    const supabase = createClient()
    const { data: role } = await supabase.from("roles").select("id").eq("name", "team_member").single()
    if (role) {
      await supabase.from("sub_team_memberships").insert({ sub_team_id: activeTeam, user_id: userId, role_id: role.id })
    }
    success("Member added.")
    router.refresh()
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Sub-Teams</h1>
        <p className="text-sm text-muted mt-0.5">Manage each media sub-team, their members and tasks</p>
      </div>

      {/* Team tab bar */}
      {subTeams.length === 0 ? (
        <EmptyState icon={<Users className="h-5 w-5" />} title="No sub-teams yet" description="Create sub-teams in Settings to get started." />
      ) : (
        <>
          <div className="flex gap-1.5 flex-wrap">
            {subTeams.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setActiveTeam(st.id)}
                className={cn(
                  "inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                  activeTeam === st.id
                    ? "bg-primary-soft text-primary border border-primary/20"
                    : "bg-surface border border-border text-muted hover:text-foreground hover:border-border-strong"
                )}
              >
                {st.name}
                <span className={cn(
                  "ml-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  activeTeam === st.id ? "bg-primary/10 text-primary" : "bg-surface-subtle text-faint"
                )}>
                  {st.sub_team_memberships.length}
                </span>
              </button>
            ))}
          </div>

          {currentTeam && (
            <div className="grid gap-5 md:grid-cols-2">
              {/* Members */}
              <div className="rounded-xl border border-border bg-surface">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">Members</p>
                    <p className="text-xs text-faint">{currentTeam.sub_team_memberships.length} people</p>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  {currentTeam.sub_team_memberships.length === 0 ? (
                    <EmptyState icon={<User className="h-4 w-4" />} title="No members yet" description="Add someone below" className="py-8" />
                  ) : (
                    <ul className="space-y-2">
                      {currentTeam.sub_team_memberships.map((m, i) => (
                        <li key={i} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-subtle transition-colors">
                          <UserAvatar name={m.users?.full_name ?? "?"} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{m.users?.full_name}</p>
                            <p className="text-xs text-faint truncate">{m.users?.email}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="pt-2 border-t border-border">
                    <Select
                      value=""
                      onChange={(v) => addMember(v)}
                      options={addMemberOptions}
                      searchable={allUsers.length > 6}
                      aria-label="Add member to sub-team"
                    />
                  </div>
                </div>
              </div>

              {/* Tasks */}
              <div className="rounded-xl border border-border bg-surface">
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-[13px] font-semibold text-foreground">Tasks</p>
                  <p className="text-xs text-faint">{currentTeam.tasks.length} tasks</p>
                </div>
                <div className="p-5 space-y-3">
                  {/* Add task */}
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      placeholder="New task…"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTask() } }}
                    />
                    <Button size="sm" onClick={addTask} loading={loading} disabled={loading || !newTaskTitle.trim()}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Select
                    value={newTaskAssignee}
                    onChange={setNewTaskAssignee}
                    options={memberOptions}
                    aria-label="Assign new task to"
                  />

                  {/* Task list */}
                  {currentTeam.tasks.length === 0 ? (
                    <EmptyState icon={<CheckSquare className="h-4 w-4" />} title="No tasks yet" description="Add a task above" className="py-8" />
                  ) : (
                    <ul className="space-y-1.5 pt-1">
                      {currentTeam.tasks.map((task) => (
                        <li key={task.id} className="flex items-center gap-3 rounded-lg border border-border bg-canvas px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{task.title}</p>
                          </div>
                          <div className="shrink-0 w-36">
                            <Select
                              value={task.status}
                              onChange={(v) => updateTaskStatus(task.id, v)}
                              options={taskStatusOptions}
                              aria-label={`Task status for ${task.title}`}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Assigned Requests */}
              <div className="rounded-xl border border-border bg-surface md:col-span-2">
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-[13px] font-semibold text-foreground">Assigned Requests</p>
                  <p className="text-xs text-faint">{currentRequests?.requests.length ?? 0} requests</p>
                </div>
                <div className="p-5">
                  {!currentRequests?.requests.length ? (
                    <EmptyState icon={<Inbox className="h-4 w-4" />} title="No requests assigned" description="Requests routed to this team will appear here" className="py-8" />
                  ) : (
                    <ul className="space-y-1.5">
                      {currentRequests.requests.map((r: any) => (
                        <li key={r.id} className="flex items-center justify-between rounded-lg border border-border bg-canvas px-3 py-2.5">
                          <span className="text-sm font-medium text-foreground truncate">{r.requests?.title}</span>
                          <Badge variant={reqBadgeVariant(r.requests?.status)} dot className="shrink-0 ml-3">
                            {(r.requests?.status ?? "").replace(/_/g, " ")}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
