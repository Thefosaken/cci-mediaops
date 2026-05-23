import { createClient as createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import type { User } from "@/types"

export async function getCurrentUser() {
  const supabase = await createServerClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return null

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", authUser.id)
    .single()

  return profile as User | null
}

export async function getCurrentUserWithRole() {
  const supabase = await createServerClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return null

  const { data: profile } = await supabase
    .from("users")
    .select("*, campus_memberships!inner(*, roles(*))")
    .eq("auth_user_id", authUser.id)
    .single()

  return profile as User & { campus_memberships: any[] } | null
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  if (user.status === "pending") {
    redirect("/login?message=Your+account+is+pending+approval")
  }
  return user
}
