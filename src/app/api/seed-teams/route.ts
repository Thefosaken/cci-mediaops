import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()

  // Verify auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized - Please log in first" }, { status: 401 })
  }

  // Get campus
  const { data: campus } = await supabase.from("campuses").select("id").limit(1).single()
  if (!campus) {
    return NextResponse.json({ error: "No campus found" }, { status: 400 })
  }

  const defaultTeams = [
    { name: "Projection", campus_id: campus.id, description: "Visuals and on-screen projection" },
    { name: "Videography", campus_id: campus.id, description: "Camera operation and video recording" },
    { name: "Photography", campus_id: campus.id, description: "Event photography" },
    { name: "Design", campus_id: campus.id, description: "Graphics and UI/UX design" },
    { name: "Light", campus_id: campus.id, description: "Stage and event lighting" },
    { name: "Sound", campus_id: campus.id, description: "Audio mixing and engineering" },
  ]

  // Insert teams
  const { data, error } = await supabase.from("sub_teams").insert(defaultTeams).select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: "Default sub-teams created successfully!", data })
}
