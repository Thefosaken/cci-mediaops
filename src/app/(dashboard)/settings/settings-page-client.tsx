"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Settings as SettingsIcon, User as UserIcon, Users, Building, Bell, Palette, Shield,
  Plus, Check, X as XIcon, Search, Power, MoreHorizontal, Mail, Send, Clock,
  Link2, Copy, ExternalLink,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
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
import { Modal } from "@/components/ui/modal"
import { approveUserWithRole, rejectPendingUser } from "@/server/actions/onboarding"
import { inviteMember, resendInvite, cancelInvite } from "@/server/actions/invites"

interface Role { id: string; name: string; description: string | null }
interface SubTeam { id: string; name: string; description: string | null; status: string }
interface UserRow {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  status: string
  invited_at: string | null
  accepted_invite_at: string | null
  campus_memberships: { id: string; role_id: string | null; status: string }[]
}
interface Campus { id: string; name: string; location: string | null }
interface PublicLinkRow {
  id: string
  token: string
  label: string
  sub_team_ids: string[]
  is_active: boolean
  submission_count: number
  created_at: string
  expires_at: string | null
  created_by_user: { full_name: string | null; email: string | null } | null
}

const SECTIONS = [
  { id: "profile", label: "Profile", icon: UserIcon, adminOnly: false },
  { id: "appearance", label: "Appearance", icon: Palette, adminOnly: false },
  { id: "notifications", label: "Notifications", icon: Bell, adminOnly: false },
  { id: "campus", label: "Campus", icon: Building, adminOnly: true },
  { id: "sub-teams", label: "Sub-teams", icon: Users, adminOnly: true },
  { id: "public-links", label: "Public request links", icon: Link2, adminOnly: true },
  { id: "users", label: "Users & access", icon: Shield, adminOnly: true },
] as const

export function SettingsPageClient({
  currentUser,
  roleName,
  isAdmin,
  canCreateLinks,
  invitedUsers,
  pendingUsers,
  activeUsers,
  subTeams,
  roles,
  campus,
  publicLinks,
}: {
  currentUser: { id: string; full_name: string | null; email: string | null; phone: string | null }
  roleName: string | null
  isAdmin: boolean
  canCreateLinks: boolean
  invitedUsers: UserRow[]
  pendingUsers: UserRow[]
  activeUsers: UserRow[]
  subTeams: SubTeam[]
  roles: Role[]
  campus: Campus | null
  publicLinks: PublicLinkRow[]
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
                  {s.id === "users" && (invitedUsers.length + pendingUsers.length) > 0 && (
                    <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-md px-1 text-[10px] font-semibold bg-warning-soft text-warning">
                      {invitedUsers.length + pendingUsers.length}
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
            {section === "public-links" && isAdmin && (
              <PublicLinksSection links={publicLinks} subTeams={subTeams} canCreate={canCreateLinks} />
            )}
            {section === "users" && isAdmin && (
              <UsersSection
                invitedUsers={invitedUsers}
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
          { key: "deadlines", label: "Due dates", desc: "Reminders for tasks and request due dates." },
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

// ── Section: Public Request Links (admin) ───────────────────────────────
function PublicLinksSection({
  links, subTeams, canCreate,
}: {
  links: PublicLinkRow[]
  subTeams: SubTeam[]
  canCreate: boolean
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [showCreate, setShowCreate] = useState(false)

  function copyLink(token: string) {
    const url = `${window.location.origin}/request/public/${token}`
    navigator.clipboard.writeText(url).then(
      () => success("Link copied to clipboard"),
      () => toastError("Could not copy link")
    )
  }

  async function toggleLink(linkId: string, currentActive: boolean) {
    const { togglePublicLink } = await import("@/server/actions/public-links")
    const r = await togglePublicLink(linkId, !currentActive)
    if (r.error) toastError(r.error)
    else { success(currentActive ? "Link deactivated" : "Link activated"); router.refresh() }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle
          title="Public request links"
          description="Generate shareable links so external people can submit media requests without logging in."
        />
        {canCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" /> Generate link
          </Button>
        )}
      </div>

      {links.length === 0 ? (
        <EmptyState
          icon={<Link2 />}
          title="No public links yet"
          description="Generate a link to share with departments, ministries, or external requesters."
          action={canCreate ? { label: "Generate link", onClick: () => setShowCreate(true) } : undefined}
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
          {links.map((link) => {
            const teamNames = link.sub_team_ids
              .map((id) => subTeams.find((st) => st.id === id)?.name)
              .filter(Boolean)
            return (
              <div key={link.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-foreground">{link.label || "Untitled link"}</p>
                    <Badge variant={link.is_active ? "success" : "muted"} size="sm" dot>
                      {link.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11.5px] text-faint">
                    <span>{link.submission_count} submission{link.submission_count !== 1 ? "s" : ""}</span>
                    {link.created_by_user?.full_name && (
                      <>
                        <span>·</span>
                        <span>by {link.created_by_user.full_name}</span>
                      </>
                    )}
                    {teamNames.length > 0 && (
                      <>
                        <span>·</span>
                        <span>to {teamNames.join(", ")}</span>
                      </>
                    )}
                  </div>
                </div>
                <Button size="xs" variant="ghost" onClick={() => copyLink(link.token)}>
                  <Copy className="h-3 w-3" /> Copy
                </Button>
                <IconButton
                  label={link.is_active ? "Deactivate" : "Activate"}
                  size="xs"
                  onClick={() => toggleLink(link.id, link.is_active)}
                >
                  <Power className="h-3 w-3" />
                </IconButton>
              </div>
            )
          })}
        </div>
      )}

      <CreatePublicLinkModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  )
}

function CreatePublicLinkModal({
  open, onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [label, setLabel] = useState("")
  const [saving, setSaving] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function create() {
    if (!label.trim()) {
      toastError("Add a label.")
      return
    }
    setSaving(true)
    const { generatePublicLink } = await import("@/server/actions/public-links")
    const r = await generatePublicLink({ label: label.trim() })
    setSaving(false)
    if (r.error) { toastError(r.error); return }
    const url = `${window.location.origin}/request/public/${r.data!.token}`
    setGeneratedUrl(url)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      success("Link copied to clipboard")
    } catch {
      setCopied(false)
    }
    router.refresh()
  }

  function handleClose() {
    setLabel("")
    setGeneratedUrl(null)
    setCopied(false)
    onClose()
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(generatedUrl!)
      setCopied(true)
      success("Link copied to clipboard")
    } catch {
      setCopied(false)
    }
  }

  if (generatedUrl) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Public request link"
        description="Share this link with anyone who needs to submit a request."
        size="sm"
      >
        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border bg-surface-subtle px-4 py-3">
            <p className="text-[11.5px] text-faint mb-1.5">Link label</p>
            <p className="text-[13px] font-medium text-foreground">{label}</p>
          </div>
          <FormField label="Link URL">
            <div className="flex items-center gap-2">
              <Input
                value={generatedUrl}
                readOnly
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1"
              />
              <Button size="sm" variant={copied ? "primary" : "secondary"} onClick={handleCopy}>
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </FormField>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Generate public request link"
      description="Anyone with this link can submit a request without logging in."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={create} loading={saving} disabled={saving || !label.trim()}>
            <Link2 className="h-3.5 w-3.5" /> Generate
          </Button>
        </>
      }
    >
      <div className="space-y-3 py-2">
        <FormField label="Link label" required helper="e.g. Teens Church Requests">
          <Input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Teens Church Design Requests"
            autoComplete="off"
          />
        </FormField>
        <div className="rounded-lg border border-info/20 bg-info-soft/20 px-3 py-2.5">
          <p className="text-[12px] text-info">
            The person submitting the request will select which team to route to.
          </p>
        </div>
      </div>
    </Modal>
  )
}

// ── Section: Users (admin) ──────────────────────────────────────────────
function UsersSection({
  invitedUsers, pendingUsers, activeUsers, roles,
}: {
  invitedUsers: UserRow[]
  pendingUsers: UserRow[]
  activeUsers: UserRow[]
  roles: Role[]
}) {
  const router = useRouter()
  const { success, error: toastError, warning } = useToast()
  const [selectedRole, setSelectedRole] = useState<Record<string, string>>({})
  const [query, setQuery] = useState("")
  const [showInvite, setShowInvite] = useState(false)

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
    const r = await approveUserWithRole(userId, roleId)
    if (!r.success) { toastError(r.error); return }
    success("User activated and notified")
    router.refresh()
  }

  async function reject(userId: string) {
    const r = await rejectPendingUser(userId)
    if (!r.success) { toastError(r.error); return }
    success("User rejected")
    router.refresh()
  }

  async function doResendInvite(userId: string) {
    const r = await resendInvite(userId)
    if (!r.success) toastError(r.error)
    else { success("Invitation resent"); router.refresh() }
  }

  async function doCancelInvite(userId: string) {
    if (!confirm("Cancel this invitation? The user will be removed and the email becomes free again.")) return
    const r = await cancelInvite(userId)
    if (!r.success) toastError(r.error)
    else { success("Invitation cancelled"); router.refresh() }
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
      <div className="flex items-start justify-between gap-3">
        <SectionTitle
          title="Users & access"
          description="Invite teammates, assign roles, manage active members."
        />
        <Button size="sm" onClick={() => setShowInvite(true)}>
          <Plus className="h-3.5 w-3.5" /> Invite member
        </Button>
      </div>

      {/* Pending invitations (sent but not yet accepted) */}
      {invitedUsers.length > 0 && (
        <div className="rounded-xl border border-info/30 bg-info-soft/30 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-info/30">
            <Mail className="h-3.5 w-3.5 text-info" />
            <h3 className="text-[13px] font-semibold text-foreground">Pending invitations</h3>
            <Badge variant="info" size="sm">{invitedUsers.length}</Badge>
          </div>
          <ul className="divide-y divide-info/20">
            {invitedUsers.map((u) => {
              const roleId = u.campus_memberships?.[0]?.role_id
              const role = roles.find((r) => r.id === roleId)
              return (
                <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={u.full_name} email={u.email} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {u.full_name ?? u.email}
                    </p>
                    <p className="text-[11.5px] text-faint truncate flex items-center gap-1.5">
                      <span className="truncate">{u.email}</span>
                      {u.invited_at && (
                        <>
                          <span className="text-faint">·</span>
                          <Clock className="h-2.5 w-2.5" />
                          <span className="tabular-nums">
                            Sent {formatDistanceToNow(new Date(u.invited_at), { addSuffix: true })}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  {role && (
                    <Badge variant="muted" size="sm">
                      {ROLE_LABELS[role.name] ?? role.name}
                    </Badge>
                  )}
                  <Button size="xs" variant="ghost" onClick={() => doResendInvite(u.id)}>
                    <Send className="h-3 w-3" /> Resend
                  </Button>
                  <IconButton label="Cancel invitation" size="xs" onClick={() => doCancelInvite(u.id)}>
                    <XIcon className="h-3 w-3" />
                  </IconButton>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Legacy pending-approval users (carry-over from old signup flow) */}
      {pendingUsers.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft/40">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-warning/30">
            <h3 className="text-[13px] font-semibold text-foreground">Pending approval</h3>
            <Badge variant="warning" size="sm">{pendingUsers.length}</Badge>
            <span className="text-[11px] text-faint ml-1">
              (signed up before invite-only mode)
            </span>
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

      <InviteModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        roles={roles}
      />


      <div className="rounded-xl border border-border bg-surface">
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

function InviteModal({
  open, onClose, roles,
}: {
  open: boolean
  onClose: () => void
  roles: Role[]
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [roleId, setRoleId] = useState("")
  const [saving, setSaving] = useState(false)

  const roleOptions = [
    { value: "", label: "Choose role…" },
    ...roles.map((r) => ({ value: r.id, label: ROLE_LABELS[r.name] ?? r.name })),
  ]

  async function send() {
    setSaving(true)
    const r = await inviteMember({ email, fullName, roleId })
    setSaving(false)
    if (!r.success) { toastError(r.error); return }
    success(`Invitation sent to ${email}`)
    setEmail(""); setFullName(""); setRoleId("")
    router.refresh()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite a member"
      description="They'll get an email with a link to set their password. The role you pick becomes active as soon as they accept."
      size="default"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={send} loading={saving} disabled={saving || !email || !fullName || !roleId}>
            <Send className="h-3.5 w-3.5" /> Send invitation
          </Button>
        </>
      }
    >
      <div className="space-y-3 py-2">
        <FormField label="Full name" required>
          <Input
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            autoComplete="off"
          />
        </FormField>
        <FormField label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value.trim())}
            placeholder="jane@example.com"
            autoComplete="off"
          />
        </FormField>
        <FormField label="Role" required helper="Determines what they can see and do in the app.">
          <Select value={roleId} onChange={setRoleId} options={roleOptions} />
        </FormField>
      </div>
    </Modal>
  )
}
