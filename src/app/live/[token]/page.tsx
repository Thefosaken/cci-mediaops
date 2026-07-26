import type { Metadata } from "next"

import { adminClientConfigured, createAdminClient } from "@/lib/supabase/admin"
import { LiveView, type LiveViewSession } from "./live-view"

export const dynamic = "force-dynamic"

/**
 * The public live run sheet.
 *
 * Reached by an unguessable token, with no account. Everything is read through the
 * service-role client because RLS grants an anonymous caller nothing — which is the
 * point: there is no policy an unauthenticated visitor could lean on, and the token is
 * the only thing that opens the door.
 *
 * The token is checked here, on the server, before a single row is fetched. An expired
 * or revoked link never reaches the point of loading a sheet.
 */

export const metadata: Metadata = {
  title: "Live run sheet",
  // A link passed around on phones should not end up in a search index.
  robots: { index: false, follow: false }
}

/**
 * The admin client is constructed without a generated `Database` generic, so every
 * table resolves to `never`. Results are therefore cast through `unknown` to the shape
 * the query actually asks for — the same pattern CLAUDE.md documents for Supabase's
 * joined-relation typing. The casts are narrow and sit next to the select that
 * justifies them.
 */
interface ShareLinkRow {
  run_sheet_id: string
  is_active: boolean
  expires_at: string | null
}

interface SheetRow {
  id: string
  title: string
  sheet_date: string | null
  events: { title: string } | null
  event_slots: { label: string } | null
}

interface SessionRow {
  id: string
  name: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  run_sheet_session_members: {
    id: string
    role_title: string | null
    users: { full_name: string } | null
  }[]
}

export default async function LiveRunSheetPage({
  params
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  if (!adminClientConfigured()) {
    return (
      <Unavailable
        heading="Live view is not configured"
        detail="This deployment is missing its service-role key, so shared links cannot be opened."
      />
    )
  }

  const admin = createAdminClient()

  const linkResult = await admin
    .from("run_sheet_share_links")
    .select("run_sheet_id, is_active, expires_at")
    .eq("token", token)
    .maybeSingle()

  const link = linkResult.data as unknown as ShareLinkRow | null

  // One message for missing, revoked and expired alike. Distinguishing them would tell
  // someone holding a wrong token whether they were close.
  const expired = link?.expires_at ? new Date(link.expires_at) <= new Date() : false
  if (!link || !link.is_active || expired) {
    return (
      <Unavailable
        heading="This link isn't active"
        detail="It may have been turned off or run out. Ask whoever shared it for a new one."
      />
    )
  }

  const [sheetResult, sessionsResult] = await Promise.all([
    admin
      .from("run_sheets")
      .select("id, title, sheet_date, events(title), event_slots:slot_id(label)")
      .eq("id", link.run_sheet_id)
      .maybeSingle(),
    admin
      .from("run_sheet_sessions")
      .select(
        "id, name, start_time, end_time, status, notes, run_sheet_session_members(id, role_title, users:user_id(full_name))"
      )
      .eq("run_sheet_id", link.run_sheet_id)
      .not("start_time", "is", null)
      .order("start_time")
  ])

  const sheet = sheetResult.data as unknown as SheetRow | null
  const sessions = sessionsResult.data as unknown as SessionRow[] | null

  if (!sheet) {
    return (
      <Unavailable
        heading="This run sheet is gone"
        detail="It was deleted after the link was shared."
      />
    )
  }

  // Best-effort: a failure to count a view must never stop the sheet rendering, so it
  // is not awaited for its result and its rejection is swallowed.
  const callRpc = admin.rpc as unknown as (
    fn: string,
    args: Record<string, string>
  ) => Promise<unknown>
  await callRpc("record_share_link_view", { p_token: token }).catch(() => undefined)

  const subtitle = [sheet.events?.title, sheet.event_slots?.label].filter(Boolean).join(" — ")

  const items: LiveViewSession[] = (sessions ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    start_time: s.start_time,
    end_time: s.end_time,
    status: s.status,
    notes: s.notes,
    people: (s.run_sheet_session_members ?? [])
      .filter((m) => m.users)
      .map((m) => ({
        id: m.id,
        name: m.users!.full_name,
        role: m.role_title
      }))
  }))

  return (
    <LiveView
      title={sheet.title}
      subtitle={subtitle || (sheet.sheet_date ?? "")}
      sessions={items}
    />
  )
}

function Unavailable({ heading, detail }: { heading: string; detail: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--color-canvas)] px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-[19px] font-semibold tracking-tight text-foreground">{heading}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{detail}</p>
      </div>
    </main>
  )
}
