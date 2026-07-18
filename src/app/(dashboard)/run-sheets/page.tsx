import { Suspense } from "react"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { RunSheetsPageClient } from "./run-sheets-page-client"

export const dynamic = "force-dynamic"

export default async function RunSheetsPage() {
  await requireAuth()
  const supabase = await createClient()

  const [{ data: runSheets }, { data: events }, { data: templates }] = await Promise.all([
    supabase
      .from("run_sheets")
      .select("id, title, status, sheet_date, events(id, title, start_time), run_sheet_sessions(id)")
      // Templates have their own section; they are not run sheets you'd open live.
      .eq("is_template", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("events")
      .select("id, title, start_time")
      .order("start_time", { ascending: false })
      .limit(60),
    supabase
      .from("run_sheets")
      .select("id, title, created_at, run_sheet_sessions(id)")
      .eq("is_template", true)
      .order("title"),
  ])

  return (
    <Suspense>
      <RunSheetsPageClient
        runSheets={
          (runSheets ?? []) as unknown as Parameters<
            typeof RunSheetsPageClient
          >[0]["runSheets"]
        }
        events={events ?? []}
        templates={
          (templates ?? []) as unknown as Parameters<
            typeof RunSheetsPageClient
          >[0]["templates"]
        }
      />
    </Suspense>
  )
}
