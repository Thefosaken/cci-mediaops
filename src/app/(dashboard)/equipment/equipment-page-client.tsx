"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SubTeam } from "@/types"

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

export function EquipmentPageClient({
  items,
  subTeams,
}: {
  items: EquipmentItem[]
  subTeams: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filterTeam, setFilterTeam] = useState("")
  const [form, setForm] = useState({
    name: "",
    subTeamId: "",
    category: "",
    assetTag: "",
    conditionStatus: "good",
    storageLocation: "",
  })

  const filtered = filterTeam
    ? items.filter((i) => i.sub_team_id === filterTeam)
    : items

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.subTeamId) return
    setLoading(true)
    const supabase = createClient()

    const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()

    await supabase.from("equipment_items").insert({
      campus_id: campus?.id,
      sub_team_id: form.subTeamId,
      name: form.name,
      category: form.category || null,
      asset_tag: form.assetTag || null,
      condition_status: form.conditionStatus,
      storage_location: form.storageLocation || null,
    })

    setShowForm(false)
    setForm({ name: "", subTeamId: "", category: "", assetTag: "", conditionStatus: "good", storageLocation: "" })
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipment</h1>
          <p className="text-sm text-muted">Track equipment per sub-team</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Add Item"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Add Equipment Item</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={addItem} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Item Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Sub-Team</Label>
                <select
                  className="flex h-9 w-full rounded-md border border bg-canvas px-3 py-2 text-sm"
                  value={form.subTeamId}
                  onChange={(e) => setForm({ ...form, subTeamId: e.target.value })}
                  required
                >
                  <option value="">Select...</option>
                  {subTeams.map((st) => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Asset Tag</Label>
                <Input value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Condition</Label>
                <select
                  className="flex h-9 w-full rounded-md border border bg-canvas px-3 py-2 text-sm"
                  value={form.conditionStatus}
                  onChange={(e) => setForm({ ...form, conditionStatus: e.target.value })}
                >
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="faulty">Faulty</option>
                  <option value="under_repair">Under Repair</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Storage Location</Label>
                <Input value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={loading}>Add Item</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setFilterTeam("")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${!filterTeam ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
        >
          All
        </button>
        {subTeams.map((st) => (
          <button
            key={st.id}
            onClick={() => setFilterTeam(st.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filterTeam === st.id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
          >
            {st.name}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <div key={item.id} className="rounded-lg border bg-surface p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-muted">{item.sub_teams?.name}</p>
              </div>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                item.condition_status === "good" ? "bg-green-100 text-green-800" :
                item.condition_status === "faulty" ? "bg-red-100 text-red-800" :
                "bg-yellow-100 text-yellow-800"
              }`}>
                {item.condition_status.replace(/_/g, " ")}
              </span>
            </div>
            {item.category && <p className="mt-1 text-xs text-muted">{item.category}</p>}
            {item.asset_tag && <p className="text-xs text-muted">Tag: {item.asset_tag}</p>}
            {item.storage_location && <p className="text-xs text-muted">📍 {item.storage_location}</p>}
            <p className="mt-2 text-xs capitalize">Status: {item.availability_status.replace(/_/g, " ")}</p>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-lg border bg-surface p-8 text-center text-muted">
            No equipment items.
          </div>
        )}
      </div>
    </div>
  )
}
