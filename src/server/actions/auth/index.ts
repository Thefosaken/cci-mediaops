"use server"

import { createClient } from "@/lib/supabase/server"
import { signUpSchema, loginSchema } from "@/lib/validators"
import type { SignUpInput, LoginInput } from "@/lib/validators"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function signUp(input: SignUpInput) {
  const parsed = signUpSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        phone: parsed.data.phone,
      },
    },
  })

  if (error) return { error: error.message }
  return { data }
}

export async function signIn(input: LoginInput) {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) return { error: error.message }
  redirect("/dashboard")
  return { data }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

export async function inviteUser(email: string, roleId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email)
  if (error) return { error: error.message }
  return { data }
}

export async function approveUser(userId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("users")
    .update({ status: "active" })
    .eq("id", userId)
  if (error) return { error: error.message }
  revalidatePath("/settings")
  return { success: true }
}

export async function assignUserRole(userId: string, roleId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("campus_memberships")
    .update({ role_id: roleId })
    .eq("user_id", userId)
  if (error) return { error: error.message }
  revalidatePath("/settings")
  return { success: true }
}
