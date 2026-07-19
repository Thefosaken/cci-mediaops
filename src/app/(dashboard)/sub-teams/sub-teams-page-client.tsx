"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Users, Plus, Search, UserPlus, Trash2, Star,
  MoreHorizontal, UserPlus2, Clock, ChevronRight,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/toast/toast-context"
import { useUrlState } from "@/lib/hooks/use-url-state"
import { cn } from "@/lib/utils/cn"
import { ROLE_LABELS } from "@/constants"

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

  const members = active?.sub_team_memberships ?? []

  const openTaskCount =
    active?.tasks.filter((t) => !["completed", "cancelled"].includes(t.status)).length ?? 0

  const equipmentIssues = teamEquipment.filter((e) =>
    ["faulty", "missing", "under_repair"].includes(e.condition_status)
  ).length

  /**
   * Leads first, then everyone else alphabetically.
   *
   * Who leads a team is the first thing you look for and the previous order —
   * whatever the database returned — buried it. Sorting by role also lets the list
   * show the split with a rule instead of a second heading.
   */
  // A team is a handful of people — sorting it every render costs nothing, and the
  // compiler cannot preserve a memo whose input is derived inline.
  const orderedMembers = [...members].sort((a, b) => {
    const rank = (name?: string | null) =>
      name === "sub_team_lead" ? 0 : name === "assistant_lead" ? 1 : 2
    const byRole = rank(a.roles?.name) - rank(b.roles?.name)
    if (byRole !== 0) return byRole
    return (a.users?.full_name ?? "").localeCompare(b.users?.full_name ?? "")
  })

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <PageHeader
        title="Sub-teams"
        description="Members, workload and standing of each media team"
        icon={<Users />}
      />

      <div className="flex min-h-0 flex-1">
        {/* ── Team rail ──────────────────────────────────────────
            Slightly wider than before so a team's name and its load fit on
            one line each — the previous 260px truncated both. */}
        <aside className="hidden w-[268px] shrink-0 overflow-y-auto border-r border-border lg:block">
          <div className="px-3 py-3">
            <p className="mb-2 px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint">
              Teams
            </p>

            {subTeams.length === 0 ? (
              <div className="px-1.5 py-6">
                <EmptyState
                  variant="compact"
                  icon={<Users />}
                  title="No sub-teams"
                  description="Create one in Settings."
                />
              </div>
            ) : (
              <ul className="space-y-px">
                {subTeams.map((st) => {
                  const memberCount = st.sub_team_memberships.length
                  const openTasks = st.tasks.filter(
                    (t) => !["completed", "cancelled"].includes(t.status)
                  ).length
                  const teamPending = pendingJoinRequests.filter(
                    (r) => r.sub_team_id === st.id
                  ).length
                  const isActive = activeId === st.id

                  return (
                    <li key={st.id}>
                      <button
                        type="button"
                        onClick={() => set({ id: st.id })}
                        className={cn(
                          "group relative w-full rounded-md py-2 pl-3 pr-2.5 text-left",
                          "transition-colors duration-100",
                          isActive ? "bg-surface-subtle" : "hover:bg-surface-subtle/50"
                        )}
                      >
                        {/* Selection reads as a rule against the rail rather than a
                            filled block — quieter, and it survives hover states. */}
                        <span
                          aria-hidden
                          className={cn(
                            "absolute inset-y-1.5 left-0 w-[2px] rounded-full transition-colors",
                            isActive ? "bg-primary" : "bg-transparent"
                          )}
                        />
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex-1 truncate text-[13px]",
                              isActive ? "font-medium text-foreground" : "text-foreground"
                            )}
                          >
                            {st.name}
                          </span>
                          {teamPending > 0 && (
                            <span className="grid h-[17px] min-w-[17px] shrink-0 place-items-center rounded-full bg-[var(--warning-soft)] px-1 text-[10px] font-semibold tabular-nums text-[var(--warning)]">
                              {teamPending}
                            </span>
                          )}
                          {st.status !== "active" && (
                            <Badge variant="muted" size="sm">
                              {st.status}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11.5px] tabular-nums text-faint">
                          {memberCount} {memberCount === 1 ? "member" : "members"}
                          {openTasks > 0 && ` · ${openTasks} open`}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Detail ───────────────────────────────────────────── */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          {!active ? (
            <div className="flex h-full items-center justify-center p-8">
              <EmptyState
                icon={<Users />}
                title="Pick a team"
                description="Choose one from the list to see its members and workload."
              />
            </div>
          ) : (
            <div className="mx-auto max-w-[900px] px-5 py-6 sm:px-6">
              {/* ── Identity ──────────────────────────────────────
                  Plain heading rather than a card. It is the subject of the
                  page, not one panel among several, and boxing it flattened
                  it to the same weight as everything below. */}
              <header className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h2 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
                      {active.name}
                    </h2>
                    {isMember && (
                      <Badge variant="success" size="sm" dot>
                        {myMembershipHere?.roles?.name
                          ? (ROLE_LABELS[myMembershipHere.roles.name] ?? "Member")
                          : "Member"}
                      </Badge>
                    )}
                  </div>

                  {active.description && (
                    <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed text-muted">
                      {active.description}
                    </p>
                  )}

                  {/* Counts as a sentence, not four boxes. The boxes restated
                      numbers each section already shows in its own header, and
                      gave equal weight to figures of very unequal importance. */}
                  <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] tabular-nums text-muted">
                    <span className="font-medium text-foreground">
                      {active.sub_team_memberships.length}
                    </span>
                    {active.sub_team_memberships.length === 1 ? "member" : "members"}
                    <Dot />
                    <span className="font-medium text-foreground">{openTaskCount}</span>
                    open {openTaskCount === 1 ? "task" : "tasks"}
                    {teamRequests.length > 0 && (
                      <>
                        <Dot />
                        <span className="font-medium text-foreground">{teamRequests.length}</span>
                        {teamRequests.length === 1 ? "request" : "requests"}
                      </>
                    )}
                    {equipmentIssues > 0 && (
                      <>
                        <Dot />
                        <span className="font-medium text-danger">{equipmentIssues}</span>
                        <span className="text-danger">
                          equipment {equipmentIssues === 1 ? "issue" : "issues"}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
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
              </header>

              {/* ── Pending joins ─────────────────────────────────
                  Kept above the fold and tinted, because it is the only thing
                  on this page waiting on the viewer to act. */}
              {canModerate && teamPendingRequests.length > 0 && (
                <section className="mt-6 overflow-hidden rounded-lg border border-[var(--warning)]/25 bg-[var(--warning-soft)]/25">
                  <div className="flex items-center gap-2 border-b border-[var(--warning)]/20 px-5 py-2.5">
                    <Clock className="size-3.5 text-[var(--warning)]" />
                    <h3 className="text-[12.5px] font-semibold text-foreground">
                      {teamPendingRequests.length} request
                      {teamPendingRequests.length === 1 ? "" : "s"} to join
                    </h3>
                  </div>
                  <ul className="divide-y divide-[var(--warning)]/15">
                    {teamPendingRequests.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                        <Avatar name={r.user?.full_name} email={r.user?.email} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {r.user?.full_name ?? "Someone"}
                          </p>
                          {r.message && (
                            <p className="mt-0.5 truncate text-[12px] text-muted">“{r.message}”</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <Button size="xs" variant="ghost" onClick={() => rejectRequest(r.id)}>
                            Decline
                          </Button>
                          <Button size="xs" onClick={() => approveRequest(r.id)}>
                            Approve
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* ── Members ───────────────────────────────────────
                  Full width and first. A sub-team is its people; everything
                  else on this page is a consequence of who is on it. */}
              <section className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
                <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                  <h3 className="text-[12.5px] font-semibold text-foreground">Members</h3>
                  {canModerate && (
                    <Button size="xs" variant="secondary" onClick={() => setShowAddMember(true)}>
                      <UserPlus className="h-3 w-3" /> Add member
                    </Button>
                  )}
                </div>

                {active.sub_team_memberships.length === 0 ? (
                  <div className="px-5 py-8">
                    <EmptyState
                      variant="compact"
                      icon={<UserPlus />}
                      title="No members yet"
                      description="Add people to assign work to this team."
                      action={
                        canModerate
                          ? { label: "Add member", onClick: () => setShowAddMember(true) }
                          : undefined
                      }
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {orderedMembers.map((m, i) => {
                      const roleName = m.roles?.name
                      const isLead = roleName === "sub_team_lead" || roleName === "assistant_lead"
                      const isMe = m.users?.id === currentUserId
                      // A rule under the last lead separates leadership from the
                      // rest without needing a second heading.
                      const endsLeadBlock = isLead && !leadIsLead(orderedMembers[i + 1])

                      return (
                        <li
                          key={m.users?.id ?? i}
                          className={cn(
                            "group flex items-center gap-3 px-5 py-2.5",
                            "transition-colors duration-100 hover:bg-surface-subtle/40",
                            endsLeadBlock && "border-b border-border"
                          )}
                        >
                          <Avatar name={m.users?.full_name} email={m.users?.email} size="sm" />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-[13px] font-medium text-foreground">
                                {m.users?.full_name ?? "Unknown"}
                              </span>
                              {isMe && <span className="text-[11px] text-faint">you</span>}
                            </div>
                            {/* Email is reference, not identity — muted and one
                                step down, rather than competing with the name. */}
                            <p className="truncate text-[11.5px] text-faint">{m.users?.email}</p>
                          </div>

                          {roleName && (
                            <span
                              className={cn(
                                "shrink-0 text-[11.5px]",
                                isLead ? "font-medium text-foreground" : "text-muted"
                              )}
                            >
                              {ROLE_LABELS[roleName] ?? roleName}
                            </span>
                          )}

                          {/* Actions stay hidden until the row is hovered, so a
                              list of twenty people isn't twenty buttons. */}
                          {(canModerate || isMe) && (
                            <DropdownMenu
                              trigger={
                                <IconButton
                                  label="Member actions"
                                  size="xs"
                                  variant="ghost"
                                  className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                                >
                                  <MoreHorizontal className="h-3 w-3" />
                                </IconButton>
                              }
                            >
                              <DropdownMenuLabel>Member</DropdownMenuLabel>
                              {canModerate && !isLead && leadRoleId && (
                                <DropdownMenuItem
                                  icon={<Star />}
                                  onSelect={() => promoteToLead(m.users!.id)}
                                >
                                  Promote to lead
                                </DropdownMenuItem>
                              )}
                              {canModerate && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    icon={<Trash2 />}
                                    variant="danger"
                                    onSelect={() => m.users && removeMember(m.users.id)}
                                  >
                                    {isMe ? "Leave team" : "Remove"}
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

              {/* ── Secondary ─────────────────────────────────────
                  Tasks, requests and equipment are consequences of the team,
                  not peers of it — so they are summaries that link out rather
                  than four equal panels competing with the member list. */}
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <Panel
                  title="Tasks"
                  count={openTaskCount}
                  countLabel={openTaskCount === 1 ? "open" : "open"}
                  action={
                    canModerate
                      ? { label: "Add", onClick: () => setShowAddTask(true) }
                      : undefined
                  }
                  empty={active.tasks.length === 0 ? "Nothing assigned yet" : undefined}
                >
                  {active.tasks.slice(0, 4).map((task) => (
                    <PanelRow key={task.id} label={task.title}>
                      <StatusBadge status={task.status} size="sm" />
                    </PanelRow>
                  ))}
                  {active.tasks.length > 4 && (
                    <PanelMore href="/requests" count={active.tasks.length - 4} />
                  )}
                </Panel>

                <Panel
                  title="Requests"
                  count={teamRequests.length}
                  countLabel="routed"
                  empty={teamRequests.length === 0 ? "None routed here" : undefined}
                >
                  {teamRequests.slice(0, 4).map((r) => (
                    <PanelRow key={r.id} label={r.title} href={`/requests?id=${r.id}`}>
                      <StatusBadge status={r.status} size="sm" />
                    </PanelRow>
                  ))}
                  {teamRequests.length > 4 && (
                    <PanelMore href="/requests" count={teamRequests.length - 4} />
                  )}
                </Panel>

                <Panel
                  title="Equipment"
                  count={teamEquipment.length}
                  countLabel="items"
                  empty={teamEquipment.length === 0 ? "None assigned" : undefined}
                >
                  {/* Condition is the only thing worth surfacing here — a list of
                      item names would just duplicate the equipment page. */}
                  <div className="space-y-1.5 px-4 py-3">
                    <ConditionBar
                      label="In good order"
                      value={teamEquipment.filter((e) => e.condition_status === "good").length}
                      total={teamEquipment.length}
                      tone="success"
                    />
                    <ConditionBar
                      label="Needs attention"
                      value={equipmentIssues}
                      total={teamEquipment.length}
                      tone="danger"
                    />
                    <ConditionBar
                      label="Checked out"
                      value={
                        teamEquipment.filter((e) =>
                          ["checked_out", "assigned"].includes(e.availability_status)
                        ).length
                      }
                      total={teamEquipment.length}
                      tone="neutral"
                    />
                  </div>
                </Panel>
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

/* ────────────────────────────────────────────────────────────────── */
/*  Secondary panel primitives                                        */
/*                                                                    */
/*  Deliberately lighter than the members section: smaller header,     */
/*  tighter rows, and a count in the header rather than a stat box.    */
/*  They summarise and link out; the page they link to is where the    */
/*  full list belongs.                                                */
/* ────────────────────────────────────────────────────────────────── */

function Dot() {
  return <span aria-hidden className="text-faint">·</span>
}

/** True when this member is a lead — used to draw the leadership divider. */
function leadIsLead(m?: { roles?: { name?: string } | null }) {
  const n = m?.roles?.name
  return n === "sub_team_lead" || n === "assistant_lead"
}

function Panel({
  title,
  count,
  countLabel,
  action,
  empty,
  children,
}: {
  title: string
  count: number
  countLabel: string
  action?: { label: string; onClick: () => void }
  empty?: string
  children?: React.ReactNode
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-1.5">
          <h3 className="text-[12.5px] font-semibold text-foreground">{title}</h3>
          <span className="text-[11.5px] tabular-nums text-faint">
            {count} {countLabel}
          </span>
        </div>
        {action && (
          <Button size="xs" variant="ghost" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>

      {empty ? (
        <p className="px-4 py-6 text-center text-[12px] text-faint">{empty}</p>
      ) : (
        <div className="divide-y divide-border-subtle">{children}</div>
      )}
    </section>
  )
}

function PanelRow({
  label,
  href,
  children,
}: {
  label: string
  href?: string
  children?: React.ReactNode
}) {
  const inner = (
    <>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">{label}</span>
      {children}
    </>
  )

  return href ? (
    <a
      href={href}
      className="flex items-center gap-2 px-4 py-2 transition-colors duration-100 hover:bg-surface-subtle/50"
    >
      {inner}
    </a>
  ) : (
    <div className="flex items-center gap-2 px-4 py-2">{inner}</div>
  )
}

function PanelMore({ href, count }: { href: string; count: number }) {
  return (
    <a
      href={href}
      className="flex items-center gap-1 px-4 py-2 text-[11.5px] text-muted transition-colors hover:text-foreground"
    >
      {count} more
      <ChevronRight className="size-3" />
    </a>
  )
}

/**
 * A proportion, shown as a bar rather than a bare number.
 *
 * "3 faulty" means nothing without knowing the team has four items or forty. The bar
 * carries that ratio at a glance, which is the actual question being asked.
 */
function ConditionBar({
  label,
  value,
  total,
  tone,
}: {
  label: string
  value: number
  total: number
  tone: "success" | "danger" | "neutral"
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] text-muted">{label}</span>
        <span
          className={cn(
            "text-[11.5px] font-medium tabular-nums",
            tone === "danger" && value > 0 ? "text-danger" : "text-foreground"
          )}
        >
          {value}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-expo)]",
            tone === "success" && "bg-[var(--success)]",
            tone === "danger" && "bg-danger",
            tone === "neutral" && "bg-muted"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
