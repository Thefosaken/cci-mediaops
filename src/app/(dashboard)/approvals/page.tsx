import { requireAuth } from "@/lib/auth/auth-helpers"
import { createClient } from "@/lib/supabase/server"
import { ApprovalsPageClient } from "./approvals-page-client"

export default async function ApprovalsPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: userRecord } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.auth_user_id)
    .single()

  const { data: pending } = await supabase
    .from("approvals")
    .select("*, requests!left(title, requesting_unit), tasks!left(title)")
    .eq("approver_id", userRecord?.id)
    .eq("status", "pending")

  const { data: history } = await supabase
    .from("approvals")
    .select("*, requests!left(title, requesting_unit), tasks!left(title)")
    .eq("approver_id", userRecord?.id)
    .not("status", "eq", "pending")
    .order("decided_at", { ascending: false })
    .limit(20)

  return <ApprovalsPageClient pending={pending ?? []} history={history ?? []} />
}
