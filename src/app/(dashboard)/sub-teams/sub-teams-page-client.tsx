"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Users, Plus, Search, UserPlus, Trash2, Star, CheckSquare,
  Inbox, Wrench, MoreHorizontal, UserPlus2, Clock, Check, X as XIcon,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/toast/toast-context"
import { useUrlState } from "@/lib/hooks/use-url-state"
import { cn } from "@/lib/utils/cn"
import { ROLE_LABELS } from "@/constants"
import { formatDistanceToNow } from "date-fns"

import { PageHeader } from "@/components/ui/page-header"
import { Button, IconButton } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Modal } from "@/components/ui/modal"
import { FormField } from "@/components/ui/form-field"
import { Avatar } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { addSubTeamMember, removeSubTeamMember, assignSubTeamLead } from "@/server/actions/sub-teams"
import { requestSubTeamJoin, approveJoinRequest, rejectJoinRequest, cancelMyJoinRequest } from "@/server/actions/join-requests"

type SubTeamRow = {
  id: string
  name: string
  description: string | null
  status: string
  sub_team_memberships: {
    role_id: string
    users: { id: string; full_name: string | null; email: string | null } | null
    roles: { id: string; name: string } | null
  }[]
  tasks: { id: string; title: string; status: string; assigned_user_id: string | null; due_date: string | null; priority: string }[]
}

type UserLite = { id: string; full_name: string | null; email: string | null }
type RoleLite = { id: string; name: string }
type MyMembership = { sub_team_id: string; role_id: string | null; roles: { name: string } | null }
type MyJoinRequest = { id: string; sub_team_id: string; status: string; created_at: string }
type PendingJoinRequest = {
  id: string
  sub_team_id: string
  user_id: string
  status: string
  message: string | null
  created_at: string
  user: { id: string; full_name: string | null; email: string | null } | null
}

export function SubTeamsPageClient({
  subTeams,
  allUsers,
  roles,
  requestJoins,
  equipment,
  currentUserId,
  isAdmin,
  myMemberships,
  myJoinRequests,
  pendingJoinRequests,
}: {
  subTeams: SubTeamRow[]
  allUsers: UserLite[]
  roles: RoleLite[]
  requestJoins: { sub_team_id: string; requests: { id: string; title: string; status: string; priority: string; deadline: string | null; requesting_unit: string | null } | null }[]
  equipment: { id: string; sub_team_id: string; condition_status: string; availability_status: string }[]
  currentUserId: string
  isAdmin: boolean
  myMemberships: MyMembership[]
  myJoinRequests: MyJoinRequest[]
  pendingJoinRequests: PendingJoinRequest[]
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const { get, set } = useUrlState()

  const activeId = get("id") ?? subTeams[0]?.id ?? null
  const [showAddMember, setShowAddMember] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)

  const active = subTeams.find((s) => s.id === activeId) ?? null

  const teamRequests = useMemo(() => {
    return requestJoins
      .filter((j) => j.sub_team_id === activeId)
      .map((j) => j.requests)
      .filter((r): r is NonNullable<typeof r> => !!r)
  }, [requestJoins, activeId])

  const teamEquipment = useMemo(() =>
    equipment.filter((e) => e.sub_team_id === activeId),
    [equipment, activeId]
  )

  const memberRoleId = roles.find((r) => r.name === "team_member")?.id
  const leadRoleId = roles.find((r) => r.name === "sub_team_lead")?.id

  // Membership flags for the active team
  const myMembershipHere = myMemberships.find((m) => m.sub_team_id === activeId) ?? null
  const isMember = !!myMembershipHere
  const isLeadHere = myMembershipHere?.roles?.name === "sub_team_lead" || myMembershipHere?.roles?.name === "assistant_lead"
  const canModerate = isAdmin || isLeadHere
  const pendingJoin = myJoinRequests.find((r) => r.sub_team_id === activeId && r.status === "pending") ?? null
  const teamPendingRequests = pendingJoinRequests.filter((r) => r.sub_team_id === activeId)

  async function addMember(userId: string) {
    if (!active || !memberRoleId) return
    const r = await addSubTeamMember(active.id, userId, memberRoleId)
    if (r.error) toastError(r.error)
    else { success("Member added"); router.refresh() }
  }

  async function requestJoin(message?: string) {
    if (!active) return
    const r = await requestSubTeamJoin(active.id, message)
    if (!r.success) toastError(r.error)
    else { success("Request sent — a lead will review it shortly"); router.refresh(); setShowJoinModal(false) }
  }

  async function cancelMyRequest() {
    if (!pendingJoin) return
    const r = await cancelMyJoinRequest(pendingJoin.id)
    if (!r.success) toastError(r.error)
    else { success("Request cancelled"); router.refresh() }
  }

  async function approveRequest(reqId: string) {
    const r = await approveJoinRequest(reqId)
    if (!r.success) toastError(r.error)
    else { success("Request approved"); router.refresh() }
  }

  async function rejectRequest(reqId: string) {
    const r = await rejectJoinRequest(reqId)
    if (!r.success) toastError(r.error)
    else { success("Request rejected"); router.refresh() }
  }
  async function removeMember(userId: string) {
    if (!active) return
    if (isLeadHere && userId === currentUserId) {
      toastError("You cannot remove yourself as a team lead.")
      return
    }
    const r = await removeSubTeamMember(active.id, userId)
    if (r.error) toastError(r.error)
    else { success("Member removed"); router.refresh() }
  }
  async function promoteToLead(userId: string) {
    if (!active) return
    const r = await assignSubTeamLead(active.id, userId)
    if (r.error) toastError(r.error)
    else { success("Promoted to lead"); router.refresh() }
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Sub-teams"
        description="Each media sub-team — members, tasks, and current load"
        icon={<Users />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] flex-1 min-h-0">
        {/* List */}
        <aside className="border-r border-border bg-canvas overflow-y-auto">
          <div className="p-3">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint mb-2">
              Sub-teams
            </p>
            {subTeams.length === 0 ? (
              <EmptyState variant="compact" icon={<Users />} title="No sub-teams" description="Create one in Settings." />
            ) : (
              <ul className="space-y-0.5">
                {subTeams.map((st) => {
                  const memberCount = st.sub_team_memberships.length
                  const openTasks = st.tasks.filter((t) => !["completed", "cancelled"].includes(t.status)).length
                  const teamPending = pendingJoinRequests.filter((r) => r.sub_team_id === st.id).length
                  return (
                    <li key={st.id}>
                      <button
                        type="button"
                        onClick={() => set({ id: st.id })}
                        className={cn(
                          "w-full rounded-md px-2.5 py-2 text-left transition-colors",
                          activeId === st.id ? "bg-surface-subtle" : "hover:bg-surface-subtle/60"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-foreground truncate flex-1">{st.name}</span>
                          {teamPending > 0 && (
                            <Badge variant="warning" size="sm">{teamPending}</Badge>
                          )}
                          {st.status !== "active" && <Badge variant="muted" size="sm">{st.status}</Badge>}
                        </div>
                        <p className="text-[11.5px] text-faint mt-0.5 tabular-nums">
                          {memberCount} {memberCount === 1 ? "member" : "members"}
                          {openTasks > 0 && ` · ${openTasks} open ${openTasks === 1 ? "task" : "tasks"}`}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Detail */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {!active ? (
            <div className="h-full flex items-center justify-center p-8">
              <EmptyState icon={<Users />} title="Pick a sub-team" description="Select one from the left." />
            </div>
          ) : (
            <div className="p-5 sm:p-6 space-y-5">
              {/* Header card */}
              <div className="rounded-xl border border-border bg-surface px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[18px] font-semibold tracking-tight text-foreground">{active.name}</h2>
                    {active.description && (
                      <p className="text-[13px] text-muted mt-1 max-w-xl">{active.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isMember && (
                      <Badge variant="success" size="sm" dot>
                        {myMembershipHere?.roles?.name
                          ? (ROLE_LABELS[myMembershipHere.roles.name] ?? "Member")
                          : "Member"}
                      </Badge>
                    )}
                    {!isMember && pendingJoin && (
                      <>
                        <Badge variant="warning" size="sm" dot>
                          <Clock className="h-2.5 w-2.5" />
                          Awaiting approval
                        </Badge>
                        <Button variant="ghost" size="xs" onClick={cancelMyRequest}>
                          Cancel
                        </Button>
                      </>
                    )}
                    {!isMember && !pendingJoin && (
                      <Button size="sm" onClick={() => setShowJoinModal(true)}>
                        <UserPlus2 className="h-3.5 w-3.5" />
                        Request to join
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Members" value={active.sub_team_memberships.length} />
                  <Stat label="Open tasks" value={active.tasks.filter((t) => !["completed", "cancelled"].includes(t.status)).length} />
                  <Stat label="Requests" value={teamRequests.length} />
                  <Stat label="Equipment" value={teamEquipment.length} />
                </div>
              </div>

              {/* Pending join requests (visible to leads + admins) */}
              {canModerate && teamPendingRequests.length > 0 && (
                <section className="rounded-xl border border-warning/30 bg-warning-soft/30 overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-3 border-b border-warning/30">
                    <Clock className="h-3.5 w-3.5 text-warning" />
                    <h3 className="text-[13px] font-semibold text-foreground">Pending join requests</h3>
                    <Badge variant="warning" size="sm">{teamPendingRequests.length}</Badge>
                  </div>
                  <ul className="divide-y divide-warning/20">
                    {teamPendingRequests.map((req) => (
                      <li key={req.id} className="flex items-start gap-3 px-5 py-3">
                        <Avatar name={req.user?.full_name} email={req.user?.email} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-foreground truncate">
                            {req.user?.full_name ?? req.user?.email}
                          </p>
                          <p className="text-[11.5px] text-faint truncate">
                            {req.user?.email}
                            <span className="mx-1.5">·</span>
                            <span className="tabular-nums">
                              {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                            </span>
                          </p>
                          {req.message && (
                            <p className="text-[12px] text-muted mt-1 italic">&ldquo;{req.message}&rdquo;</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="xs" onClick={() => approveRequest(req.id)}>
                            <Check className="h-3 w-3" /> Approve
                          </Button>
                          <IconButton label="Reject" size="xs" onClick={() => rejectRequest(req.id)}>
                            <XIcon className="h-3 w-3" />
                          </IconButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Two-column grid */}
              <div className="grid gap-5 lg:grid-cols-2">
                {/* Members */}
                <section className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border px-5 py-3">
                    <div>
                      <h3 className="text-[13px] font-semibold text-foreground">Members</h3>
                      <p className="text-[11.5px] text-faint">{active.sub_team_memberships.length} people</p>
                    </div>
                    <Button size="xs" variant="secondary" onClick={() => setShowAddMember(true)}>
                      <UserPlus className="h-3 w-3" /> Add
                    </Button>
                  </div>
                  {active.sub_team_memberships.length === 0 ? (
                    <div className="p-5">
                      <EmptyState variant="compact" icon={<UserPlus />} title="No members yet"
                        description="Add team members to assign work."
                        action={{ label: "Add member", onClick: () => setShowAddMember(true) }} />
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {active.sub_team_memberships.map((m) => {
                        const isLead = m.roles?.name === "sub_team_lead" || m.roles?.name === "assistant_lead"
                        return (
                          <li key={m.users?.id ?? Math.random()} className="flex items-center gap-3 px-5 py-2.5">
                            <Avatar name={m.users?.full_name} email={m.users?.email} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[13px] font-medium text-foreground truncate">
                                  {m.users?.full_name ?? "?"}
                                </span>
                                {isLead && (
                                  <Star className="h-3 w-3 text-warning fill-warning" aria-hidden="true" />
                                )}
                              </div>
                              <p className="text-[11.5px] text-faint truncate">{m.users?.email}</p>
                            </div>
                            {m.roles?.name && (
                              <Badge variant={isLead ? "warning" : "muted"} size="sm">
                                {ROLE_LABELS[m.roles.name] ?? m.roles.name}
                              </Badge>
                            )}
                            {(canModerate || m.users?.id === currentUserId) && (
                              <DropdownMenu trigger={
                                <IconButton label="Member actions" size="xs" variant="ghost">
                                  <MoreHorizontal className="h-3 w-3" />
                                </IconButton>
                              }>
                                <DropdownMenuLabel>Member</DropdownMenuLabel>
                                {canModerate && !isLead && leadRoleId && (
                                  <DropdownMenuItem icon={<Star />} onSelect={() => promoteToLead(m.users!.id)}>
                                    Promote to lead
                                  </DropdownMenuItem>
                                )}
                                {canModerate && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem icon={<Trash2 />} variant="danger" onSelect={() => m.users && removeMember(m.users.id)}>
                                      {m.users?.id === currentUserId ? "Leave team" : "Remove"}
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenu>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>

                {/* Tasks */}
                <section className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border px-5 py-3">
                    <div>
                      <h3 className="text-[13px] font-semibold text-foreground">Tasks</h3>
                      <p className="text-[11.5px] text-faint">{active.tasks.length} total</p>
                    </div>
                    <Button size="xs" variant="secondary" onClick={() => setShowAddTask(true)}>
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                  </div>
                  {active.tasks.length === 0 ? (
                    <div className="p-5">
                      <EmptyState variant="compact" icon={<CheckSquare />}
                        title="No tasks yet"
                        description="Add a task or route a request to assign work."
                        action={{ label: "Add task", onClick: () => setShowAddTask(true) }} />
                    </div>
                  ) : (
                    <ul className="divide-y divide-border max-h-[360px] overflow-y-auto">
                      {active.tasks.slice(0, 8).map((task) => (
                        <li key={task.id} className="flex items-center gap-2 px-5 py-2.5">
                          <span className="text-[13px] text-foreground flex-1 truncate">{task.title}</span>
                          <StatusBadge status={task.status} size="sm" />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Requests */}
                <section className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="border-b border-border px-5 py-3">
                    <h3 className="text-[13px] font-semibold text-foreground">Routed requests</h3>
                    <p className="text-[11.5px] text-faint">{teamRequests.length} total</p>
                  </div>
                  {teamRequests.length === 0 ? (
                    <div className="p-5">
                      <EmptyState variant="compact" icon={<Inbox />} title="No requests" description="Routed requests will show up here." />
                    </div>
                  ) : (
                    <ul className="divide-y divide-border max-h-[360px] overflow-y-auto">
                      {teamRequests.slice(0, 8).map((r) => (
                        <li key={r.id}>
                          <a
                            href={`/requests?id=${r.id}`}
                            className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-hover transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium text-foreground truncate">{r.title}</p>
                              <p className="text-[11.5px] text-faint truncate">{r.requesting_unit}</p>
                            </div>
                            <StatusBadge status={r.status} size="sm" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Equipment summary */}
                <section className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="border-b border-border px-5 py-3">
                    <h3 className="text-[13px] font-semibold text-foreground">Equipment</h3>
                    <p className="text-[11.5px] text-faint">{teamEquipment.length} items</p>
                  </div>
                  <div className="p-5 grid grid-cols-2 gap-3">
                    <Stat
                      label="Good"
                      value={teamEquipment.filter((e) => e.condition_status === "good").length}
                      tone="success"
                    />
                    <Stat
                      label="Issues"
                      value={teamEquipment.filter((e) => ["faulty", "missing", "under_repair"].includes(e.condition_status)).length}
                      tone="danger"
                    />
                    <Stat
                      label="Available"
                      value={teamEquipment.filter((e) => e.availability_status === "available").length}
                    />
                    <Stat
                      label="In use"
                      value={teamEquipment.filter((e) => e.availability_status === "checked_out" || e.availability_status === "assigned").length}
                    />
                  </div>
                </section>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add member modal */}
      {active && (
        <AddMemberModal
          open={showAddMember}
          onClose={() => setShowAddMember(false)}
          allUsers={allUsers}
          currentMemberIds={active.sub_team_memberships.map((m) => m.users?.id).filter(Boolean) as string[]}
          onAdd={(uid) => { addMember(uid); setShowAddMember(false) }}
        />
      )}

      {/* Add task modal */}
      {active && (
        <AddTaskModal
          open={showAddTask}
          onClose={() => setShowAddTask(false)}
          subTeamId={active.id}
          members={active.sub_team_memberships.map((m) => m.users).filter((u): u is UserLite => !!u)}
          onCreated={() => { setShowAddTask(false); router.refresh() }}
        />
      )}

      {/* Request-to-join modal */}
      {active && (
        <JoinRequestModal
          open={showJoinModal}
          onClose={() => setShowJoinModal(false)}
          teamName={active.name}
          onSubmit={requestJoin}
        />
      )}
    </div>
  )
}

function JoinRequestModal({
  open, onClose, teamName, onSubmit,
}: {
  open: boolean
  onClose: () => void
  teamName: string
  onSubmit: (message?: string) => void
}) {
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function go() {
    setSubmitting(true)
    await onSubmit(message.trim() || undefined)
    setMessage("")
    setSubmitting(false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Request to join ${teamName}`}
      description="A team lead or admin will review your request and approve it."
      size="default"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={go} loading={submitting}>Send request</Button>
        </>
      }
    >
      <FormField
        label="Note for the lead"
        helper="Optional — let them know why you want to join, what gear or skills you bring, etc."
      >
        <Textarea
          autoFocus
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`I'd love to serve on ${teamName}…`}
          rows={4}
        />
      </FormField>
    </Modal>
  )
}

function Stat({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "success" | "danger" }) {
  return (
    <div className="rounded-md border border-border bg-surface-subtle/40 px-3 py-2">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-faint">{label}</p>
      <p className={cn(
        "text-[18px] font-semibold tabular-nums leading-none mt-1",
        tone === "success" && "text-success",
        tone === "danger" && "text-danger",
        tone === "default" && "text-foreground"
      )}>
        {value}
      </p>
    </div>
  )
}

function AddMemberModal({
  open, onClose, allUsers, currentMemberIds, onAdd,
}: {
  open: boolean
  onClose: () => void
  allUsers: UserLite[]
  currentMemberIds: string[]
  onAdd: (userId: string) => void
}) {
  const [query, setQuery] = useState("")
  const available = useMemo(() => {
    const list = allUsers.filter((u) => !currentMemberIds.includes(u.id))
    if (!query.trim()) return list
    const q = query.toLowerCase()
    return list.filter((u) =>
      (u.full_name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q)
    )
  }, [allUsers, currentMemberIds, query])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add member"
      description="Pick from active users. They'll join with the Team Member role."
      size="default"
    >
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email…"
        leadingIcon={<Search />}
        className="mb-3"
      />
      <ul className="max-h-[360px] overflow-y-auto -mx-2">
        {available.length === 0 ? (
          <li className="px-4 py-8 text-center text-[13px] text-faint">No users found</li>
        ) : (
          available.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onAdd(u.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 rounded-md text-left hover:bg-surface-subtle transition-colors"
              >
                <Avatar name={u.full_name} email={u.email} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground truncate">{u.full_name ?? "?"}</p>
                  <p className="text-[11.5px] text-faint truncate">{u.email}</p>
                </div>
                <Plus className="h-3.5 w-3.5 text-faint" />
              </button>
            </li>
          ))
        )}
      </ul>
    </Modal>
  )
}

function AddTaskModal({
  open, onClose, subTeamId, members, onCreated,
}: {
  open: boolean
  onClose: () => void
  subTeamId: string
  members: UserLite[]
  onCreated: () => void
}) {
  const { success, error: toastError } = useToast()
  const [title, setTitle] = useState("")
  const [assignee, setAssignee] = useState("")
  const [saving, setSaving] = useState(false)

  async function go() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const supabase = createClient()
      const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from("users").select("id").eq("auth_user_id", authUser?.id).single()
      const { error } = await supabase.from("tasks").insert({
        campus_id: campus?.id,
        sub_team_id: subTeamId,
        title,
        assigned_user_id: assignee || null,
        created_by: profile?.id,
        status: "to_do",
      })
      if (error) throw new Error(error.message)
      success("Task added")
      setTitle("")
      setAssignee("")
      onCreated()
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to add task")
    } finally { setSaving(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      description="Add a task for this sub-team."
      size="default"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={go} loading={saving} disabled={!title.trim()}>Create</Button>
        </>
      }
    >
      <div className="space-y-3 py-2">
        <FormField label="Title" required>
          <Input value={title} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?" />
        </FormField>
        <FormField label="Assign to" helper="Optional">
          <Select
            value={assignee}
            onChange={setAssignee}
            options={[{ value: "", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.full_name ?? m.email ?? "—" }))]}
            searchable={members.length > 6}
          />
        </FormField>
      </div>
    </Modal>
  )
}
