import { Suspense } from "react"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { RunSheetsPageClient } from "./run-sheets-page-client"

export const dynamic = "force-dynamic"

export default async function RunSheetsPage() {
  await requireAuth()
  const supabase = await createClient()

  const [{ data: runSheets }, { data: events }] = await Promise.all([
    supabase
      .from("run_sheets")
      .select("*, events(id, title, start_time), run_sheet_segments(*)")
      .order("created_at", { ascending: false }),
    supabase
      .from("events")
      .select("id, title, start_time")
      .order("start_time", { ascending: false })
      .limit(60),
  ])

  return (
    <Suspense>
      <RunSheetsPageClient runSheets={runSheets ?? []} events={events ?? []} />
    </Suspense>
  )
}
