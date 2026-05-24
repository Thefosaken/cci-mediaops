"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Settings as SettingsIcon, User as UserIcon, Users, Building, Bell, Palette, Shield,
  Plus, Check, X as XIcon, Search, Power, MoreHorizontal, Trash2,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/toast/toast-context"
import { useUrlState } from "@/lib/hooks/use-url-state"
import { useTheme } from "@/lib/theme/theme-context"
import { cn } from "@/lib/utils/cn"
import { ROLE_LABELS } from "@/constants"

import { PageHeader } from "@/components/ui/page-header"
import { Button, IconButton } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/form-field"
import { Avatar } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"

interface Role { id: string; name: string; description: string | null }
interface SubTeam { id: string; name: string; description: string | null; status: string }
interface UserRow {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  status: string
  campus_memberships: { id: string; role_id: string | null; status: string }[]
}
interface Campus { id: string; name: string; location: string | null }

const SECTIONS = [
  { id: "profile", label: "Profile", icon: UserIcon, adminOnly: false },
  { id: "appearance", label: "Appearance", icon: Palette, adminOnly: false },
  { id: "notifications", label: "Notifications", icon: Bell, adminOnly: false },
  { id: "campus", label: "Campus", icon: Building, adminOnly: true },
  { id: "sub-teams", label: "Sub-teams", icon: Users, adminOnly: true },
  { id: "users", label: "Users & access", icon: Shield, adminOnly: true },
] as const

export function SettingsPageClient({
  currentUser,
  roleName,
  isAdmin,
  pendingUsers,
  activeUsers,
  subTeams,
  roles,
  campus,
}: {
  currentUser: { id: string; full_name: string | null; email: string | null; phone: string | null }
  roleName: string | null
  isAdmin: boolean
  pendingUsers: UserRow[]
  activeUsers: UserRow[]
  subTeams: SubTeam[]
  roles: Role[]
  campus: Campus | null
}) {
  const { get, set } = useUrlState()
  const section = get("section") ?? "profile"
  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin)

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Settings"
        description="Account, campus, and team configuration"
        icon={<SettingsIcon />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="border-r border-border bg-canvas overflow-y-auto">
          <nav className="p-3 space-y-0.5">
            {visibleSections.map((s) => {
              const Icon = s.icon
              const active = section === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => set({ section: s.id === "profile" ? null : s.id })}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                    active
                      ? "bg-surface-subtle text-foreground font-medium"
                      : "text-muted hover:text-foreground hover:bg-surface-subtle/60"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 text-faint shrink-0" />
                  {s.label}
                  {s.id === "users" && pendingUsers.length > 0 && (
                    <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-md px-1 text-[10px] font-semibold bg-warning-soft text-warning">
                      {pendingUsers.length}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="p-5 sm:p-6 max-w-3xl space-y-6">
            {section === "profile" && <ProfileSection user={currentUser} roleName={roleName} />}
            {section === "appearance" && <AppearanceSection />}
            {section === "notifications" && <NotificationsSection />}
            {section === "campus" && isAdmin && <CampusSection campus={campus} />}
            {section === "sub-teams" && isAdmin && <SubTeamsSection subTeams={subTeams} />}
            {section === "users" && isAdmin && (
              <UsersSection
                pendingUsers={pendingUsers}
                activeUsers={activeUsers}
                roles={roles}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// ── Section: Profile ─────────────────────────────────────────────────────
function ProfileSection({
  user, roleName,
}: {
  user: { id: string; full_name: string | null; email: string | null; phone: string | null }
  roleName: string | null
}) {
  const { success, error: toastError } = useToast()
  const router = useRouter()
  const [fullName, setFullName] = useState(user.full_name ?? "")
  const [phone, setPhone] = useState(user.phone ?? "")
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from("users")
      .update({ full_name: fullName, phone: phone || null })
      .eq("id", user.id)
    setSaving(false)
    if (error) toastError(error.message)
    else { success("Profile updated"); router.refresh() }
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="Profile" description="Your account details." />
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-3 mb-5">
          <Avatar name={user.full_name} email={user.email} size="lg" />
          <div>
            <p className="text-[14px] font-semibold text-foreground">{user.full_name ?? "—"}</p>
            <p className="text-[12px] text-muted">{user.email}</p>
            {roleName && (
              <Badge variant="muted" size="sm" className="mt-1">{ROLE_LABELS[roleName] ?? roleName}</Badge>
            )}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
          <FormField label="Email" helper="Email can only be changed by an admin.">
            <Input value={user.email ?? ""} disabled />
          </FormField>
          <FormField label="Phone" className="sm:col-span-2">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 800 000 0000" />
          </FormField>
        </div>
        <div className="flex justify-end mt-4 pt-4 border-t border-border">
          <Button size="sm" onClick={save} loading={saving}>Save changes</Button>
        </div>
      </div>
    </div>
  )
}

// ── Section: Appearance ──────────────────────────────────────────────────
function AppearanceSection() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  return (
    <div className="space-y-5">
      <SectionTitle title="Appearance" description="Customize how MediaOps looks." />
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <div>
          <p className="text-[13px] font-semibold text-foreground">Theme</p>
          <p className="text-[12px] text-muted mt-0.5">Currently using <span className="font-medium text-foreground">{resolvedTheme}</span> mode.</p>
          <div className="mt-3 grid grid-cols-3 gap-2 max-w-md">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={cn(
                  "rounded-lg border px-3 py-3 text-left transition-colors capitalize",
                  theme === t
                    ? "border-foreground bg-surface-subtle text-foreground"
                    : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground"
                )}
              >
                <div className="text-[13px] font-medium">{t}</div>
                <div className="text-[11px] text-faint mt-0.5">
                  {t === "system" ? "Follow OS" : t === "light" ? "Bright" : "Dim"}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Section: Notifications ───────────────────────────────────────────────
function NotificationsSection() {
  const [prefs, setPrefs] = useState({
    assignments: true,
    approvals: true,
    deadlines: true,
    incidents: false,
    digest: false,
  })
  return (
    <div className="space-y-5">
      <SectionTitle
        title="Notifications"
        description="Choose what reaches your inbox. Email/SMS delivery comes in a later release."
      />
      <div className="rounded-xl border border-border bg-surface divide-y divide-border">
        {[
          { key: "assignments", label: "Assignments", desc: "When you're assigned to a service role." },
          { key: "approvals", label: "Approvals", desc: "When work is awaiting your approval." },
          { key: "deadlines", label: "Deadlines", desc: "Reminders for tasks and request deadlines." },
          { key: "incidents", label: "Incidents", desc: "When new incidents are reported in your sub-teams." },
          { key: "digest", label: "Weekly digest", desc: "Weekly summary email of your team's activity." },
        ].map((p) => (
          <div key={p.key} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">{p.label}</p>
              <p className="text-[12px] text-muted">{p.desc}</p>
            </div>
            <Switch
              checked={prefs[p.key as keyof typeof prefs]}
              onChange={(v) => setPrefs((s) => ({ ...s, [p.key]: v }))}
            />
          </div>
        ))}
      </div>
      <p className="text-[12px] text-faint">
        Preferences are stored locally until backend delivery channels are wired.
      </p>
    </div>
  )
}

// ── Section: Campus (admin) ──────────────────────────────────────────────
function CampusSection({ campus }: { campus: Campus | null }) {
  const { success, error: toastError } = useToast()
  const router = useRouter()
  const [name, setName] = useState(campus?.name ?? "")
  const [location, setLocation] = useState(campus?.location ?? "")
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!campus) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from("campuses").update({ name, location }).eq("id", campus.id)
    setSaving(false)
    if (error) toastError(error.message); else { success("Campus updated"); router.refresh() }
  }

  if (!campus) {
    return (
      <EmptyState
        icon={<Building />}
        title="No campus configured"
        description="Reach out to a super-admin to set up your campus."
      />
    )
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="Campus" description="Local campus details and defaults." />
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <FormField label="Campus name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Location">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, country" />
        </FormField>
        <div className="flex justify-end pt-4 border-t border-border">
          <Button size="sm" onClick={save} loading={saving}>Save</Button>
        </div>
      </div>
    </div>
  )
}

// ── Section: Sub-teams (admin) ───────────────────────────────────────────
function SubTeamsSection({ subTeams }: { subTeams: SubTeam[] }) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [saving, setSaving] = useState(false)

  async function create() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const supabase = createClient()
      const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
      if (!campus) throw new Error("No campus")
      const { error } = await supabase.from("sub_teams").insert({
        campus_id: campus.id,
        name: newName.trim(),
        description: newDesc.trim() || null,
      })
      if (error) throw new Error(error.message)
      setNewName(""); setNewDesc("")
      success("Sub-team created"); router.refresh()
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed")
    } finally { setSaving(false) }
  }

  async function toggleStatus(st: SubTeam) {
    const supabase = createClient()
    const { error } = await supabase.from("sub_teams")
      .update({ status: st.status === "active" ? "inactive" : "active" })
      .eq("id", st.id)
    if (error) toastError(error.message); else { success("Updated"); router.refresh() }
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="Sub-teams" description="Configure media sub-teams for this campus." />

      <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-faint">
          New sub-team
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr_auto] gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" />
          <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" />
          <Button onClick={create} loading={saving} disabled={!newName.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </div>

      {subTeams.length === 0 ? (
        <EmptyState icon={<Users />} title="No sub-teams yet" description="Create one above." />
      ) : (
        <div className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
          {subTeams.map((st) => (
            <div key={st.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground">{st.name}</p>
                {st.description && <p className="text-[12px] text-muted mt-0.5">{st.description}</p>}
              </div>
              <Badge variant={st.status === "active" ? "success" : "muted"} size="sm" dot>
                {st.status}
              </Badge>
              <Switch
                checked={st.status === "active"}
                onChange={() => toggleStatus(st)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Section: Users (admin) ──────────────────────────────────────────────
function UsersSection({
  pendingUsers, activeUsers, roles,
}: {
  pendingUsers: UserRow[]
  activeUsers: UserRow[]
  roles: Role[]
}) {
  const router = useRouter()
  const { success, error: toastError, warning } = useToast()
  const [selectedRole, setSelectedRole] = useState<Record<string, string>>({})
  const [query, setQuery] = useState("")

  const roleOptions = useMemo(
    () => [{ value: "", label: "Choose role…" }, ...roles.map((r) => ({ value: r.id, label: ROLE_LABELS[r.name] ?? r.name }))],
    [roles]
  )

  const filteredActive = useMemo(() => {
    if (!query.trim()) return activeUsers
    const q = query.toLowerCase()
    return activeUsers.filter((u) =>
      (u.full_name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q)
    )
  }, [activeUsers, query])

  async function approve(userId: string) {
    const roleId = selectedRole[userId]
    if (!roleId) { warning("Choose a role first"); return }
    const supabase = createClient()
    const { error } = await supabase.from("users").update({ status: "active" }).eq("id", userId)
    if (error) { toastError(error.message); return }
    const user = pendingUsers.find((u) => u.id === userId)
    const membershipId = user?.campus_memberships?.[0]?.id
    if (membershipId) {
      await supabase.from("campus_memberships").update({ role_id: roleId, status: "active" }).eq("id", membershipId)
    }
    success("User activated"); router.refresh()
  }

  async function reject(userId: string) {
    const supabase = createClient()
    await supabase.from("users").update({ status: "suspended" }).eq("id", userId)
    success("User rejected"); router.refresh()
  }

  async function suspend(userId: string) {
    const supabase = createClient()
    await supabase.from("users").update({ status: "suspended" }).eq("id", userId)
    success("User suspended"); router.refresh()
  }

  async function reactivate(userId: string) {
    const supabase = createClient()
    await supabase.from("users").update({ status: "active" }).eq("id", userId)
    success("User reactivated"); router.refresh()
  }

  async function changeRole(userId: string, roleId: string) {
    const user = activeUsers.find((u) => u.id === userId)
    const mid = user?.campus_memberships?.[0]?.id
    if (!mid) return
    const supabase = createClient()
    const { error } = await supabase.from("campus_memberships").update({ role_id: roleId }).eq("id", mid)
    if (error) toastError(error.message); else { success("Role updated"); router.refresh() }
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="Users & access" description="Approve new users and manage roles." />

      {pendingUsers.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft/40">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-warning/30">
            <h3 className="text-[13px] font-semibold text-foreground">Pending approval</h3>
            <Badge variant="warning" size="sm">{pendingUsers.length}</Badge>
          </div>
          <ul className="divide-y divide-warning/20">
            {pendingUsers.map((u) => (
              <li key={u.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar name={u.full_name} email={u.email} size="sm" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{u.full_name ?? "?"}</p>
                    <p className="text-[12px] text-faint truncate">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={selectedRole[u.id] ?? ""}
                    onChange={(v) => setSelectedRole((p) => ({ ...p, [u.id]: v }))}
                    options={roleOptions}
                    aria-label="Role"
                    className="!w-[160px] [&>button]:h-8"
                  />
                  <Button size="xs" onClick={() => approve(u.id)}>
                    <Check className="h-3 w-3" /> Approve
                  </Button>
                  <IconButton label="Reject" size="xs" onClick={() => reject(u.id)}>
                    <XIcon className="h-3 w-3" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">Active members</h3>
            <p className="text-[11.5px] text-faint">{activeUsers.length} total</p>
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            leadingIcon={<Search />}
            className="h-8 w-[220px]"
          />
        </div>
        {filteredActive.length === 0 ? (
          <div className="p-5">
            <EmptyState variant="compact" icon={<Users />} title="No matches" description="Try a different search." />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filteredActive.map((u) => {
              const roleId = u.campus_memberships?.[0]?.role_id
              const roleObj = roles.find((r) => r.id === roleId)
              return (
                <li key={u.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Avatar name={u.full_name} email={u.email} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground truncate">{u.full_name ?? "?"}</p>
                    <p className="text-[11.5px] text-faint truncate">{u.email}</p>
                  </div>
                  <Select
                    value={roleId ?? ""}
                    onChange={(v) => changeRole(u.id, v)}
                    options={roleOptions.filter((o) => o.value !== "")}
                    aria-label="Role"
                    className="!w-[160px] [&>button]:h-8"
                  />
                  <DropdownMenu trigger={
                    <IconButton label="Actions" size="xs" variant="ghost">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </IconButton>
                  }>
                    {u.status === "active" ? (
                      <DropdownMenuItem icon={<Power />} variant="danger" onSelect={() => suspend(u.id)}>
                        Suspend
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem icon={<Power />} onSelect={() => reactivate(u.id)}>
                        Reactivate
                      </DropdownMenuItem>
                    )}
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-[13px] font-semibold text-foreground mb-3">Roles</h3>
        <ul className="space-y-1.5">
          {roles.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-1.5 border-b border-border last:border-0">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground">{ROLE_LABELS[r.name] ?? r.name}</p>
                {r.description && <p className="text-[11.5px] text-muted">{r.description}</p>}
              </div>
              <Badge variant="muted" size="sm" className="font-mono">{r.name}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-[16px] font-semibold tracking-tight text-foreground">{title}</h2>
      {description && <p className="text-[12.5px] text-muted mt-1 max-w-xl">{description}</p>}
    </div>
  )
}
