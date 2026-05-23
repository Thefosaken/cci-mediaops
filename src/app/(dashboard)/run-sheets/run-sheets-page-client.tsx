"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface RunSheetSegment {
  id: string
  title: string
  sequence_order: number
  segment_type: string
  projection_cue: string | null
  sound_cue: string | null
  lighting_cue: string | null
  camera_cue: string | null
  social_media_cue: string | null
  status: string
}

interface RunSheet {
  id: string
  title: string
  status: string
  events: { title: string; start_time: string } | null
  run_sheet_segments: RunSheetSegment[]
}

export function RunSheetsPageClient({
  runSheets,
  events,
}: {
  runSheets: RunSheet[]
  events: { id: string; title: string; start_time: string }[]
}) {
  const router = useRouter()
  const [activeSheet, setActiveSheet] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [newSheetTitle, setNewSheetTitle] = useState("")
  const [newSheetEvent, setNewSheetEvent] = useState("")
  const [liveMode, setLiveMode] = useState(false)
  const [currentSegment, setCurrentSegment] = useState(0)

  async function createRunSheet() {
    if (!newSheetTitle.trim() || !newSheetEvent) return
    const supabase = createClient()

    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("auth_user_id", authUser?.id)
      .single()

    const { data } = await supabase
      .from("run_sheets")
      .insert({
        event_id: newSheetEvent,
        title: newSheetTitle,
        created_by: user?.id,
      })
      .select()
      .single()

    if (data) {
      // Add default segments
      const segments = [
        { title: "Opening Prayer", type: "prayer", order: 0 },
        { title: "Worship", type: "worship", order: 1 },
        { title: "Announcements", type: "announcement", order: 2 },
        { title: "Offering", type: "offering", order: 3 },
        { title: "Sermon", type: "sermon", order: 4 },
        { title: "Altar Call", type: "altar_call", order: 5 },
        { title: "Closing Charge", type: "closing", order: 6 },
      ]

      for (const seg of segments) {
        await supabase.from("run_sheet_segments").insert({
          run_sheet_id: data.id,
          title: seg.title,
          segment_type: seg.type,
          sequence_order: seg.order,
        })
      }
    }

    setShowForm(false)
    setNewSheetTitle("")
    setNewSheetEvent("")
    router.refresh()
  }

  async function updateCue(segmentId: string, field: string, value: string) {
    const supabase = createClient()
    await supabase.from("run_sheet_segments").update({ [field]: value }).eq("id", segmentId)
    router.refresh()
  }

  async function toggleLive(sheetId: string, status: string) {
    const supabase = createClient()
    if (status === "live") {
      setActiveSheet(sheetId)
      setLiveMode(true)
    }
    await supabase.from("run_sheets").update({ status }).eq("id", sheetId)
    router.refresh()
  }

  async function markSegment(segmentId: string, status: string) {
    const supabase = createClient()
    await supabase.from("run_sheet_segments").update({ status }).eq("id", segmentId)
    router.refresh()
  }

  const activeRunSheet = runSheets.find((rs) => rs.id === activeSheet)

  if (liveMode && activeRunSheet) {
    const segments = activeRunSheet.run_sheet_segments.sort((a, b) => a.sequence_order - b.sequence_order)
    const seg = segments[currentSegment]

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">🔴 Live: {activeRunSheet.title}</h1>
            <p className="text-sm text-muted-foreground">{activeRunSheet.events?.title}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setLiveMode(false); setActiveSheet(null) }}>
              Exit Live Mode
            </Button>
          </div>
        </div>

        <Card className="border-2 border-blue-500">
          <CardHeader>
            <CardTitle className="text-xl">Current Segment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <p className="text-3xl font-bold">{seg?.title}</p>
              <p className="text-muted-foreground">
                {currentSegment + 1} of {segments.length}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {seg?.projection_cue && <div className="rounded-md bg-muted p-3"><strong>Projection:</strong> {seg.projection_cue}</div>}
              {seg?.sound_cue && <div className="rounded-md bg-muted p-3"><strong>Sound:</strong> {seg.sound_cue}</div>}
              {seg?.lighting_cue && <div className="rounded-md bg-muted p-3"><strong>Lighting:</strong> {seg.lighting_cue}</div>}
              {seg?.camera_cue && <div className="rounded-md bg-muted p-3"><strong>Camera:</strong> {seg.camera_cue}</div>}
              {seg?.social_media_cue && <div className="rounded-md bg-muted p-3"><strong>Social:</strong> {seg.social_media_cue}</div>}
            </div>
            <div className="flex justify-center gap-4">
              <Button
                variant="outline"
                disabled={currentSegment === 0}
                onClick={() => setCurrentSegment((p) => Math.max(0, p - 1))}
              >
                ← Previous
              </Button>
              <Button
                disabled={currentSegment >= segments.length - 1}
                onClick={() => {
                  markSegment(seg.id, "completed")
                  setCurrentSegment((p) => Math.min(segments.length - 1, p + 1))
                }}
              >
                Next →
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Run Sheets</h1>
          <p className="text-sm text-muted-foreground">Create and use live service run sheets</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "New Run Sheet"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Create Run Sheet</CardTitle></CardHeader>
          <CardContent className="flex gap-3">
            <Input placeholder="Run sheet title" value={newSheetTitle} onChange={(e) => setNewSheetTitle(e.target.value)} />
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={newSheetEvent}
              onChange={(e) => setNewSheetEvent(e.target.value)}
            >
              <option value="">Select event...</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.title}</option>
              ))}
            </select>
            <Button onClick={createRunSheet}>Create</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {runSheets.map((rs) => (
          <Card key={rs.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{rs.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{rs.events?.title}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setActiveSheet(rs.id)}>
                    Edit Cues
                  </Button>
                  <Button size="sm" onClick={() => toggleLive(rs.id, "live")}>
                    Start Live
                  </Button>
                </div>
              </div>
            </CardHeader>
            {activeSheet === rs.id && (
              <CardContent>
                <div className="space-y-3">
                  {[...rs.run_sheet_segments]
                    .sort((a, b) => a.sequence_order - b.sequence_order)
                    .map((seg) => (
                      <div key={seg.id} className="rounded-md border p-3">
                        <p className="font-medium text-sm mb-2">
                          {seg.sequence_order + 1}. {seg.title}
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <input className="rounded border border-input bg-background px-2 py-1" placeholder="Projection cue" value={seg.projection_cue ?? ""} onChange={(e) => updateCue(seg.id, "projection_cue", e.target.value)} />
                          <input className="rounded border border-input bg-background px-2 py-1" placeholder="Sound cue" value={seg.sound_cue ?? ""} onChange={(e) => updateCue(seg.id, "sound_cue", e.target.value)} />
                          <input className="rounded border border-input bg-background px-2 py-1" placeholder="Lighting cue" value={seg.lighting_cue ?? ""} onChange={(e) => updateCue(seg.id, "lighting_cue", e.target.value)} />
                          <input className="rounded border border-input bg-background px-2 py-1" placeholder="Camera cue" value={seg.camera_cue ?? ""} onChange={(e) => updateCue(seg.id, "camera_cue", e.target.value)} />
                          <input className="rounded border border-input bg-background px-2 py-1 md:col-span-2" placeholder="Social media cue" value={seg.social_media_cue ?? ""} onChange={(e) => updateCue(seg.id, "social_media_cue", e.target.value)} />
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
        {runSheets.length === 0 && (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            No run sheets yet.
          </div>
        )}
      </div>
    </div>
  )
}
