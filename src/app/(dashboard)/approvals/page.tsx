import { Suspense } from "react"
import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { ApprovalsPageClient } from "./approvals-page-client"

export const dynamic = "force-dynamic"

export default async function ApprovalsPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const [pendingRes, historyRes] = await Promise.all([
    supabase
      .from("approvals")
      .select("*, requests!left(id, title, requesting_unit, deadline, priority), tasks!left(id, title), submitted_by_user:submitted_by(full_name, email)")
      .eq("approver_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("approvals")
      .select("*, requests!left(id, title), tasks!left(id, title)")
      .eq("approver_id", user.id)
      .not("status", "eq", "pending")
      .order("decided_at", { ascending: false })
      .limit(40),
  ])

  return (
    <Suspense>
      <ApprovalsPageClient
        pending={pendingRes.data ?? []}
        history={historyRes.data ?? []}
      />
    </Suspense>
  )
}
