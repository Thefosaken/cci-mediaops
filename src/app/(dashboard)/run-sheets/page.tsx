import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { RunSheetsPageClient } from "./run-sheets-page-client"

export default async function RunSheetsPage() {
  await requireAuth()
  const supabase = await createClient()

  const { data: runSheets } = await supabase
    .from("run_sheets")
    .select("*, events(title, start_time), run_sheet_segments(*)")

  const { data: events } = await supabase
    .from("events")
    .select("id, title, start_time")
    .order("start_time", { ascending: false })

  return <RunSheetsPageClient runSheets={runSheets ?? []} events={events ?? []} />
}
