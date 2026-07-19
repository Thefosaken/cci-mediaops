"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Wrench, Plus, Search, MapPin, Tag, MoreHorizontal, AlertTriangle,
  CheckCircle2, LogIn, LogOut, RefreshCcw, ArrowRightLeft, Trash2,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/lib/toast/toast-context"
import { useUrlState } from "@/lib/hooks/use-url-state"
import { cn } from "@/lib/utils/cn"

import { PageHeader } from "@/components/ui/page-header"
import { Toolbar, ToolbarGroup } from "@/components/ui/toolbar"
import { Button, IconButton } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/form-field"
import { SidePanel } from "@/components/ui/side-panel"
import { DataList, DataItem } from "@/components/ui/data-list"
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar } from "@/components/ui/avatar"
import { format } from "date-fns"
import {
  assignEquipmentToEvent,
  checkOutEquipment,
  checkInEquipment,
  reportEquipmentIssue,
  updateEquipmentItem,
} from "@/server/actions/equipment"

interface EquipmentRow {
  id: string
  name: string
  category: string | null
  condition_status: string
  availability_status: string
  sub_team_id: string
  sub_teams: { id: string; name: string } | null
  current_custodian: { id: string; full_name: string | null; email: string | null } | null
  storage_location: string | null
  asset_tag: string | null
  serial_number: string | null
  description: string | null
  notes: string | null
  updated_at: string
}

const CONDITION_OPTIONS = [
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "faulty", label: "Faulty" },
  { value: "missing", label: "Missing" },
  { value: "under_repair", label: "Under repair" },
]

const EMPTY_FORM = {
  name: "",
  subTeamId: "",
  category: "",
  assetTag: "",
  serialNumber: "",
  conditionStatus: "good",
  storageLocation: "",
  description: "",
}

export function EquipmentPageClient({
  items,
  subTeams,
  events,
  users,
}: {
  items: EquipmentRow[]
  subTeams: { id: string; name: string }[]
  events: { id: string; title: string; start_time: string }[]
  users: { id: string; full_name: string | null; email: string | null }[]
}) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const { get, set, clear } = useUrlState()

  const detailId = get("id")
  const showNew = get("new") === "1"

  const [statusTab, setStatusTab] = useState<string>("all")
  const [teamFilter, setTeamFilter] = useState<string>("all")
  const [query, setQuery] = useState("")
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (showNew) setForm(EMPTY_FORM) }, [showNew])

  const detail = useMemo(() => items.find((i) => i.id === detailId) ?? null, [items, detailId])

  const counts = useMemo(() => ({
    all: items.length,
    available: items.filter((i) => i.availability_status === "available").length,
    checked_out: items.filter((i) => i.availability_status === "checked_out").length,
    issues: items.filter((i) => ["faulty", "missing", "under_repair"].includes(i.condition_status)).length,
  }), [items])

  const filtered = useMemo(() => {
    let list = items
    if (statusTab === "issues") {
      list = list.filter((i) => ["faulty", "missing", "under_repair"].includes(i.condition_status))
    } else if (statusTab !== "all") {
      list = list.filter((i) => i.availability_status === statusTab)
    }
    if (teamFilter !== "all") list = list.filter((i) => i.sub_team_id === teamFilter)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.category ?? "").toLowerCase().includes(q) ||
        (i.asset_tag ?? "").toLowerCase().includes(q) ||
        (i.serial_number ?? "").toLowerCase().includes(q)
      )
    }
    return list
  }, [items, statusTab, teamFilter, query])

  async function handleAdd() {
    if (!form.name.trim() || !form.subTeamId) {
      toastError("Name and sub-team are required")
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
      const { data, error } = await supabase.from("equipment_items").insert({
        campus_id: campus?.id,
        sub_team_id: form.subTeamId,
        name: form.name,
        category: form.category || null,
        asset_tag: form.assetTag || null,
        serial_number: form.serialNumber || null,
        condition_status: form.conditionStatus,
        storage_location: form.storageLocation || null,
        description: form.description || null,
      }).select().single()
      if (error) throw new Error(error.message)
      clear("new")
      success("Equipment added", { label: "Open", onClick: () => set({ id: data!.id }) })
      router.refresh()
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to add equipment")
    } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Equipment"
        description="Track gear, custodians, and condition across sub-teams"
        icon={<Wrench />}
        actions={
          <Button size="sm" onClick={() => set({ new: "1" })}>
            <Plus className="h-3.5 w-3.5" /> Add item
          </Button>
        }
      />

      <div className="border-b border-border bg-canvas px-5 sm:px-6">
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList>
            <TabsTrigger value="all" badge={counts.all}>All</TabsTrigger>
            <TabsTrigger value="available" badge={counts.available}>Available</TabsTrigger>
            <TabsTrigger value="checked_out" badge={counts.checked_out}>Checked out</TabsTrigger>
            <TabsTrigger value="issues" badge={counts.issues || undefined}>Issues</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Toolbar>
        <ToolbarGroup>
          <Input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, tag, serial…"
            leadingIcon={<Search />}
            className="h-8 w-[280px]" />
          <Select
            value={teamFilter}
            onChange={setTeamFilter}
            options={[{ value: "all", label: "All sub-teams" }, ...subTeams.map((s) => ({ value: s.id, label: s.name }))]}
            className="!w-[180px] [&>button]:h-8"
            aria-label="Sub-team filter"
          />
        </ToolbarGroup>
        <span className="text-[11.5px] text-faint tabular-nums">{filtered.length} {filtered.length === 1 ? "item" : "items"}</span>
      </Toolbar>

      <div className="px-5 sm:px-6 py-6">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Wrench />}
            title={items.length === 0 ? "No equipment yet" : "No matching items"}
            description={items.length === 0 ? "Add your first piece of equipment to start tracking inventory." : "Adjust filters or search."}
            action={items.length === 0 ? { label: "Add item", onClick: () => set({ new: "1" }) } : undefined}
          />
        ) : (
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-subtle/40">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-faint">
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5 hidden md:table-cell">Sub-team</th>
                  <th className="px-4 py-2.5 hidden lg:table-cell">Custodian</th>
                  <th className="px-4 py-2.5">Condition</th>
                  <th className="px-4 py-2.5">Availability</th>
                  <th className="px-4 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-surface-hover transition-colors cursor-pointer"
                    onClick={() => set({ id: item.id })}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{item.name}</span>
                        {item.asset_tag && (
                          <span className="text-[11px] font-mono text-faint">#{item.asset_tag}</span>
                        )}
                      </div>
                      <p className="text-[12px] text-muted truncate mt-0.5">
                        {item.category ?? "—"}
                        {item.storage_location && (
                          <span className="ml-1 text-faint">· {item.storage_location}</span>
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-muted">
                      <Badge variant="muted" size="sm">{item.sub_teams?.name ?? "—"}</Badge>
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      {item.current_custodian ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar name={item.current_custodian.full_name} email={item.current_custodian.email} size="xs" />
                          <span className="text-[12px] text-foreground truncate">
                            {item.current_custodian.full_name}
                          </span>
                        </div>
                      ) : <span className="text-[12px] text-faint italic">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={item.condition_status} size="sm" />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={item.availability_status} size="sm" />
                    </td>
                    <td className="px-4 py-2.5">
                      <IconButton label="Open" size="xs" onClick={(e) => { e.stopPropagation(); set({ id: item.id }) }}>
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add modal */}
      <Modal
        open={showNew}
        onClose={() => clear("new")}
        title="Add equipment"
        description="Register a new piece of gear so it can be tracked, assigned, and checked out."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => clear("new")} disabled={loading}>Cancel</Button>
            <Button onClick={handleAdd} loading={loading}>Add item</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 py-2">
          <FormField label="Item name" required className="sm:col-span-2">
            <Input value={form.name} autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Shure SM58 Microphone" />
          </FormField>
          <FormField label="Sub-team" required>
            <Select value={form.subTeamId} onChange={(v) => setForm({ ...form, subTeamId: v })}
              options={[{ value: "", label: "Select…" }, ...subTeams.map((s) => ({ value: s.id, label: s.name }))]} />
          </FormField>
          <FormField label="Category">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="e.g. Microphone" />
          </FormField>
          <FormField label="Asset tag">
            <Input value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })}
              placeholder="e.g. CCI-001" className="font-mono" />
          </FormField>
          <FormField label="Serial number">
            <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
              placeholder="Serial / IMEI" className="font-mono" />
          </FormField>
          <FormField label="Condition">
            <Select value={form.conditionStatus} onChange={(v) => setForm({ ...form, conditionStatus: v })}
              options={CONDITION_OPTIONS} />
          </FormField>
          <FormField label="Storage location">
            <Input value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
              placeholder="e.g. AV Cupboard, Shelf 2" />
          </FormField>
          <FormField label="Description" className="sm:col-span-2">
            <Textarea value={form.description} rows={2}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Any extra context worth recording…" />
          </FormField>
        </div>
      </Modal>

      {/* Detail panel */}
      <SidePanel
        open={!!detail}
        onClose={() => clear("id")}
        title={detail?.name ?? "Equipment"}
        headerSlot={detail && (
          <>
            <StatusBadge status={detail.condition_status} size="sm" />
            <StatusBadge status={detail.availability_status} size="sm" />
          </>
        )}
        size="lg"
        footer={detail && (
          <EquipmentActions
            item={detail}
            events={events}
            users={users}
            onChange={() => router.refresh()}
          />
        )}
      >
        {detail && <EquipmentDetail item={detail} />}
      </SidePanel>
    </div>
  )
}

function EquipmentActions({
  item, events, users, onChange,
}: {
  item: EquipmentRow
  events: { id: string; title: string; start_time: string }[]
  users: { id: string; full_name: string | null; email: string | null }[]
  onChange: () => void
}) {
  const { success, error: toastError } = useToast()
  const [showAssign, setShowAssign] = useState(false)
  const [showIssue, setShowIssue] = useState(false)
  const [showCheckIn, setShowCheckIn] = useState(false)

  return (
    <>
      <DropdownMenu
        trigger={
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        }
      >
        <DropdownMenuLabel>Condition</DropdownMenuLabel>
        <DropdownMenuItem icon={<CheckCircle2 />} onSelect={async () => {
          const r = await updateEquipmentItem(item.id, { condition_status: "good" })
          if (r.error) toastError(r.error); else { success("Marked good"); onChange() }
        }}>Mark good</DropdownMenuItem>
        <DropdownMenuItem icon={<RefreshCcw />} onSelect={async () => {
          const r = await updateEquipmentItem(item.id, { condition_status: "under_repair" })
          if (r.error) toastError(r.error); else { success("Marked under repair"); onChange() }
        }}>Under repair</DropdownMenuItem>
        <DropdownMenuItem icon={<AlertTriangle />} variant="danger" onSelect={() => setShowIssue(true)}>
          Report issue
        </DropdownMenuItem>
        <DropdownMenuItem variant="danger" onSelect={async () => {
          const r = await updateEquipmentItem(item.id, { condition_status: "missing" })
          if (r.error) toastError(r.error); else { success("Marked missing"); onChange() }
        }}>Mark missing</DropdownMenuItem>
      </DropdownMenu>

      {item.availability_status === "checked_out" ? (
        <Button variant="secondary" size="sm" onClick={() => setShowCheckIn(true)}>
          <LogIn className="h-3.5 w-3.5" /> Check in
        </Button>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setShowAssign(true)}>
          <ArrowRightLeft className="h-3.5 w-3.5" /> Assign / check out
        </Button>
      )}

      {/* Assign modal */}
      <AssignModal
        open={showAssign}
        onClose={() => setShowAssign(false)}
        equipmentId={item.id}
        events={events}
        users={users}
        onDone={() => { onChange(); setShowAssign(false) }}
      />
      <IssueModal
        open={showIssue}
        onClose={() => setShowIssue(false)}
        equipmentId={item.id}
        onDone={() => { onChange(); setShowIssue(false) }}
      />
      <CheckInModal
        open={showCheckIn}
        onClose={() => setShowCheckIn(false)}
        equipmentId={item.id}
        onDone={() => { onChange(); setShowCheckIn(false) }}
      />
    </>
  )
}

function AssignModal({
  open, onClose, equipmentId, events, users, onDone,
}: {
  open: boolean
  onClose: () => void
  equipmentId: string
  events: { id: string; title: string; start_time: string }[]
  users: { id: string; full_name: string | null; email: string | null }[]
  onDone: () => void
}) {
  const { success, error: toastError } = useToast()
  const [eventId, setEventId] = useState("")
  const [userId, setUserId] = useState("")
  const [checkOutNow, setCheckOutNow] = useState(true)
  const [saving, setSaving] = useState(false)

  async function go() {
    if (!eventId || !userId) { toastError("Pick an event and a custodian"); return }
    setSaving(true)
    const r = await assignEquipmentToEvent(equipmentId, eventId, userId)
    if (r.error) { toastError(r.error); setSaving(false); return }
    if (checkOutNow) {
      // Find the just-created assignment and check it out
      const supabase = createClient()
      const { data: assignment } = await supabase
        .from("equipment_assignments")
        .select("id")
        .eq("equipment_item_id", equipmentId)
        .eq("event_id", eventId)
        .eq("assigned_to_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (assignment) await checkOutEquipment(assignment.id)
    }
    success(checkOutNow ? "Assigned and checked out" : "Assigned")
    setSaving(false)
    onDone()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign equipment"
      description="Link this item to an event and a custodian. You can also check it out right away."
      size="default"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={go} loading={saving}>Assign</Button>
        </>
      }
    >
      <div className="space-y-3 py-2">
        <FormField label="Event" required>
          <Select value={eventId} onChange={setEventId}
            options={[{ value: "", label: "Pick event…" }, ...events.map((e) => ({ value: e.id, label: e.title, description: format(new Date(e.start_time), "EEE, MMM d") }))]}
            searchable={events.length > 6} />
        </FormField>
        <FormField label="Custodian" required>
          <Select value={userId} onChange={setUserId}
            options={[{ value: "", label: "Pick person…" }, ...users.map((u) => ({ value: u.id, label: u.full_name ?? u.email ?? "—" }))]}
            searchable={users.length > 8} />
        </FormField>
        <Checkbox
          label="Check out immediately"
          checked={checkOutNow}
          onChange={(e) => setCheckOutNow(e.target.checked)}
        />
      </div>
    </Modal>
  )
}

function IssueModal({
  open, onClose, equipmentId, onDone,
}: {
  open: boolean
  onClose: () => void
  equipmentId: string
  onDone: () => void
}) {
  const { success, error: toastError } = useToast()
  const [issue, setIssue] = useState("")
  const [saving, setSaving] = useState(false)

  async function go() {
    if (!issue.trim()) return
    setSaving(true)
    const r = await reportEquipmentIssue(equipmentId, issue)
    setSaving(false)
    if (r.error) toastError(r.error)
    else { success("Issue logged"); setIssue(""); onDone() }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Report issue"
      description="Mark the item as faulty and record what's wrong."
      size="default"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={go} loading={saving} disabled={!issue.trim()}>Report</Button>
        </>
      }
    >
      <FormField label="What's wrong?" required>
        <Textarea autoFocus value={issue} onChange={(e) => setIssue(e.target.value)}
          placeholder="Describe the issue…" />
      </FormField>
    </Modal>
  )
}

function CheckInModal({
  open, onClose, equipmentId, onDone,
}: {
  open: boolean
  onClose: () => void
  equipmentId: string
  onDone: () => void
}) {
  const { success, error: toastError } = useToast()
  const [condition, setCondition] = useState("good")
  const [saving, setSaving] = useState(false)

  async function go() {
    setSaving(true)
    const supabase = createClient()
    const { data: assignment } = await supabase
      .from("equipment_assignments")
      .select("id")
      .eq("equipment_item_id", equipmentId)
      .eq("status", "checked_out")
      .order("checkout_time", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!assignment) {
      setSaving(false)
      toastError("No active checkout found")
      return
    }
    const r = await checkInEquipment(assignment.id, condition)
    setSaving(false)
    if (r.error) toastError(r.error)
    else { success("Checked in"); onDone() }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Check in equipment"
      description="Confirm the condition and return the item to inventory."
      size="default"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={go} loading={saving}>Check in</Button>
        </>
      }
    >
      <FormField label="Return condition" required>
        <Select value={condition} onChange={setCondition} options={CONDITION_OPTIONS} />
      </FormField>
    </Modal>
  )
}

function EquipmentDetail({ item }: { item: EquipmentRow }) {
  return (
    <div className="space-y-5">
      <DataList>
        <DataItem label="Sub-team">{item.sub_teams?.name}</DataItem>
        <DataItem label="Category">{item.category}</DataItem>
        <DataItem label="Asset tag">
          {item.asset_tag ? <span className="font-mono">#{item.asset_tag}</span> : null}
        </DataItem>
        <DataItem label="Serial">
          {item.serial_number ? <span className="font-mono">{item.serial_number}</span> : null}
        </DataItem>
        <DataItem label="Location">
          {item.storage_location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 text-faint" /> {item.storage_location}
            </span>
          ) : null}
        </DataItem>
        <DataItem label="Custodian">
          {item.current_custodian ? (
            <div className="flex items-center gap-1.5">
              <Avatar name={item.current_custodian.full_name} email={item.current_custodian.email} size="xs" />
              {item.current_custodian.full_name}
            </div>
          ) : null}
        </DataItem>
        <DataItem label="Updated">
          <span className="tabular-nums">{format(new Date(item.updated_at), "MMM d, yyyy 'at' h:mm a")}</span>
        </DataItem>
      </DataList>

      {item.description && (
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint mb-1.5">Description</p>
          <p className="text-[13px] text-foreground whitespace-pre-wrap">{item.description}</p>
        </div>
      )}
      {item.notes && (
        <div className={cn("rounded-lg p-3 border", item.condition_status === "faulty" || item.condition_status === "missing" ? "border-danger/30 bg-danger-soft" : "border-border bg-surface-subtle/40")}>
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint mb-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Notes / issue
          </p>
          <p className="text-[13px] text-foreground whitespace-pre-wrap">{item.notes}</p>
        </div>
      )}
    </div>
  )
}
