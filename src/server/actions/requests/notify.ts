import { createAdminClient } from "@/lib/supabase/admin"

export async function notifyNewRequest(requestId: string, title: string, subTeamIds: string[]) {
  const admin = createAdminClient()

  const { data: roleRows } = await (admin.from("roles" as never) as any)
    .select("id, name")
    .in("name", ["super_admin", "media_admin", "sub_team_lead", "assistant_lead"])
  if (!roleRows?.length) return
  const roleMap = new Map((roleRows as { id: string; name: string }[]).map((r) => [r.name, r.id]))

  const adminRoleIds = [roleMap.get("super_admin"), roleMap.get("media_admin")].filter(Boolean) as string[]

  const notifiable = new Set<string>()

  if (adminRoleIds.length) {
    const { data: admins } = await (admin.from("campus_memberships" as never) as any)
      .select("user_id")
      .in("role_id", adminRoleIds)
      .eq("status", "active")
    for (const a of (admins ?? []) as { user_id: string }[]) if (a.user_id) notifiable.add(a.user_id)
  }

  const leadRoleId = roleMap.get("sub_team_lead")
  const asstLeadRoleId = roleMap.get("assistant_lead")
  const teamLeadIds = [leadRoleId, asstLeadRoleId].filter(Boolean) as string[]

  if (teamLeadIds.length && subTeamIds.length) {
    const { data: leads } = await (admin.from("sub_team_memberships" as never) as any)
      .select("user_id")
      .in("sub_team_id", subTeamIds)
      .in("role_id", teamLeadIds)
      .eq("status", "active")
    for (const l of (leads ?? []) as { user_id: string }[]) if (l.user_id) notifiable.add(l.user_id)
  }

  if (notifiable.size === 0) return

  const inAppRows = Array.from(notifiable).map((uid) => ({
    user_id: uid,
    type: "new_request",
    title: `New request: ${title}`,
    body: "A new media request has been submitted.",
    entity_type: "request" as const,
    entity_id: requestId,
  }))
  await (admin.from("notifications" as never) as any).insert(inAppRows)
}
