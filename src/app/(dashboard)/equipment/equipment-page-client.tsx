"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/form-field"
import { useToast } from "@/lib/toast/toast-context"
import { Wrench, Plus, MapPin, Tag } from "lucide-react"
import { cn } from "@/lib/utils/cn"

interface EquipmentItem {
  id: string
  name: string
  category: string | null
  condition_status: string
  availability_status: string
  sub_team_id: string
  sub_teams: { name: string } | null
  storage_location: string | null
  asset_tag: string | null
  notes: string | null
}

function conditionVariant(status: string) {
  switch (status) {
    case "good":         return "success" as const
    case "faulty":
    case "missing":      return "danger" as const
    case "under_repair": return "warning" as const
    default:             return "muted" as const
  }
}

function availabilityVariant(status: string) {
  switch (status) {
    case "available":  return "success" as const
    case "checked_out":return "warning" as const
    case "in_repair":  return "info" as const
    case "retired":    return "muted" as const
    default:           return "muted" as const
  }
}

const EMPTY_FORM = {
  name: "",
  subTeamId: "",
  category: "",
  assetTag: "",
  conditionStatus: "good",
  storageLocation: "",
}

const CONDITION_OPTIONS = [
  { value: "good",         label: "Good" },
  { value: "fair",         label: "Fair" },
  { value: "faulty",       label: "Faulty" },
  { value: "under_repair", label: "Under Repair" },
]

export function EquipmentPageClient({
  items,
  subTeams,
}: {
  items: EquipmentItem[]
  subTeams: { id: string; name: string }[]
}) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filterTeam, setFilterTeam] = useState("")
  const [form, setForm] = useState(EMPTY_FORM)

  const subTeamOptions = [
    { value: "", label: "Select sub-team…" },
    ...subTeams.map((st) => ({ value: st.id, label: st.name })),
  ]

  const filtered = filterTeam ? items.filter((i) => i.sub_team_id === filterTeam) : items

  const closeModal = useCallback(() => {
    setShowModal(false)
    setForm(EMPTY_FORM)
  }, [])

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.subTeamId) return
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
      const { error } = await supabase.from("equipment_items").insert({
        campus_id: campus?.id,
        sub_team_id: form.subTeamId,
        name: form.name,
        category: form.category || null,
        asset_tag: form.assetTag || null,
        condition_status: form.conditionStatus,
        storage_location: form.storageLocation || null,
      })
      if (error) throw error
      closeModal()
      success("Equipment item added.")
      router.refresh()
    } catch { showError("Failed to add item.") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Equipment</h1>
          <p className="text-sm text-muted mt-0.5">Track gear and assets per sub-team</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {[{ id: "", name: "All" }, ...subTeams].map((st) => (
          <button
            key={st.id}
            type="button"
            onClick={() => setFilterTeam(st.id)}
            className={cn(
              "inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150",
              filterTeam === st.id
                ? "bg-primary-soft text-primary border border-primary/20"
                : "bg-surface border border-border text-muted hover:text-foreground hover:border-border-strong"
            )}
          >
            {st.name}
          </button>
        ))}
        {filtered.length > 0 && (
          <span className="ml-auto self-center text-xs text-faint tabular-nums">
            {filtered.length} {filtered.length === 1 ? "item" : "items"}
          </span>
        )}
      </div>

      {/* Equipment grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-5 w-5" />}
          title="No equipment items"
          description={filterTeam ? "Try a different filter." : "Add your first piece of equipment."}
          action={!filterTeam ? { label: "Add Item", onClick: () => setShowModal(true) } : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-border bg-surface p-4 hover:border-border-strong transition-colors duration-150"
            >
              {/* Name + condition */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                  <p className="text-xs text-faint">{item.sub_teams?.name}</p>
                </div>
                <Badge variant={conditionVariant(item.condition_status)} dot className="shrink-0">
                  {item.condition_status.replace(/_/g, " ")}
                </Badge>
              </div>

              {/* Meta row */}
              <div className="mt-3 flex flex-col gap-1">
                {item.category && (
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <Tag className="h-3 w-3 text-faint" aria-hidden="true" />
                    {item.category}
                  </span>
                )}
                {item.asset_tag && (
                  <span className="text-xs text-faint font-mono">#{item.asset_tag}</span>
                )}
                {item.storage_location && (
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <MapPin className="h-3 w-3 text-faint" aria-hidden="true" />
                    {item.storage_location}
                  </span>
                )}
              </div>

              {/* Availability */}
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-xs text-faint">Availability</span>
                <Badge variant={availabilityVariant(item.availability_status)} dot>
                  {item.availability_status.replace(/_/g, " ")}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add item modal */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title="Add Equipment Item"
        description="Register a new piece of gear or asset."
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={loading}>Cancel</Button>
            <Button type="submit" form="add-equipment-form" loading={loading} disabled={loading}>Add Item</Button>
          </>
        }
      >
        <form id="add-equipment-form" onSubmit={addItem} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Item name" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Shure SM58 Microphone" required />
          </FormField>
          <FormField label="Sub-team" required>
            <Select value={form.subTeamId} onChange={(v) => setForm({ ...form, subTeamId: v })} options={subTeamOptions} aria-label="Sub-team" />
          </FormField>
          <FormField label="Category" helper="Optional">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Microphone" />
          </FormField>
          <FormField label="Asset tag" helper="Optional">
            <Input value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} placeholder="e.g. CCI-001" />
          </FormField>
          <FormField label="Condition">
            <Select value={form.conditionStatus} onChange={(v) => setForm({ ...form, conditionStatus: v })} options={CONDITION_OPTIONS} aria-label="Condition status" />
          </FormField>
          <FormField label="Storage location" helper="Optional" className="sm:col-span-2">
            <Input value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} placeholder="e.g. AV Cupboard, Shelf 2" />
          </FormField>
        </form>
      </Modal>
    </div>
  )
}
