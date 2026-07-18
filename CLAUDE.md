# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For naming/import/formatting conventions, also read **AGENTS.md** in this directory — that file is the authoritative style guide.

## Commands

```bash
npm run dev        # Next.js 16 dev server (Turbopack)
npm run build      # Production build — runs tsc as part of compilation
npm run start      # Run the production build
npm run typecheck  # tsc --noEmit (strict mode)
npm run lint       # ESLint (next/core-web-vitals + typescript)
```

There are no tests in this repo. Verify changes with `npm run build` (catches both type errors and Next runtime config issues).

**Deploy**: pushing to `master` auto-deploys to Vercel via the GitHub integration. To deploy manually: `vercel --prod` from the project root (project is linked).

**Supabase migrations are NOT applied automatically.** Files in `supabase/migrations/` must be pasted into the Supabase SQL Editor in numeric order. Files in `supabase/maintenance/` are one-off destructive scripts the operator runs intentionally (e.g. `reset_for_first_user.sql` wipes everything so the next signup re-bootstraps).

## Big-picture architecture

This is an internal operations tool for one church campus' media team — invite-only, role-aware, Linear/Vercel aesthetic. The model behind it:

### User lifecycle is anchored in the `handle_new_auth_user` Postgres trigger

The trigger (defined in migration `00002`, evolved by `00007` and `00008`) is the single source of truth for what happens when a new `auth.users` row appears. It handles three distinct cases:

1. **First user** (when `count(public.users) = 0`): bootstraps the entire org — creates `organizations`, `campuses` (active), the 7 default `sub_teams`, and assigns `super_admin` role. This account auto-activates.
2. **Subsequent users via `auth.signUp`**: creates a `public.users` row with `status = 'pending'` and a pending `campus_membership` with `role_id = NULL` (legacy self-signup flow — kept for backward compatibility but the sign-up page no longer permits it).
3. **Invite acceptance**: when an admin invites someone via `inviteMember`, a `public.users` row is pre-created. When the invitee clicks the magic link and Supabase Auth fires the trigger, the trigger detects the existing row by email and **re-links** it (updates `auth_user_id`, sets `accepted_invite_at`).

Any change to user creation logic should consider all three paths.

### Auth flow has three landing screens after `/auth/callback`

`src/app/auth/callback/route.ts` exchanges the code for a session, then routes based on context:
- `type=invite` or `type=recovery` → `/set-password` (invitees set their initial password here; password-reset users also reuse it)
- `users.invited_at` is set but `accepted_invite_at` is null → also `/set-password` (catches invitees who arrived without explicit `type`)
- `status = 'pending'` (legacy self-signup) → `/pending`
- Otherwise → `/dashboard`

`requireAuth()` in `src/lib/auth/auth-helpers.ts` enforces the pending redirect for every dashboard route.

### Two Supabase clients: cookie-bound vs service-role

- `src/lib/supabase/server.ts` — `createClient()`: the per-request authenticated client (RLS applies, runs as the logged-in user). Use this in almost all server actions and queries.
- `src/lib/supabase/admin.ts` — `createAdminClient()`: service-role client (bypasses RLS, can call `auth.admin.*`). **Server-only.** Used only for invite/cancel flows (`src/server/actions/invites/`). Requires the `SUPABASE_SERVICE_ROLE_KEY` env var; `adminClientConfigured()` checks before throwing.

Never import `admin.ts` from anything reachable by the browser.

### RLS is permissive; gates live in the application layer

Every table in `public.*` lets any authenticated user read freely (see `00003_rls_policies.sql`, `00004_insert_update_policies.sql`, `00005_select_policies_fix.sql`, `00009_users_admin_read_policy.sql`). Role enforcement (e.g. "only admins can invite") happens in server actions and via the UI guard `isAdmin` derived from `getCurrentUserWithRole().campus_memberships[0].roles.name`. Don't assume RLS will stop a bad action — gate in server code.

Two load-bearing reads depend specifically on the permissive policies for `users` and `campus_memberships` added in `00009`: the Settings → Users & access screen (admin sees all signups, including `status='pending'`) and the sidebar's `pendingUsers` badge (`getShellCounts`). The original `00003` policy only allowed reading your own row, which silently zeroed both. If you ever tighten reads on those tables, you must also rework how pending signups surface to admins, or the "waiting for admin approval" loop will dead-end again.

### Page conventions

Almost every dashboard route is a pair:
- `page.tsx` — server component, fetches data with `createClient()`, passes it to the client
- `{name}-page-client.tsx` — `"use client"`, holds interactive state

For detail flows, state lives in URL params via the `useUrlState` hook (`src/lib/hooks/use-url-state.ts`):
- `?id=X` opens the `SidePanel` for that record
- `?new=1` opens the create `Modal`
- `?tab=X`, `?status=X`, `?section=X` for tab/section state

This pattern is consistent across requests, equipment, incidents, sub-teams, settings, etc. Stick to it when adding new pages.

### Detail panels vs. modals

- `SidePanel` (`src/components/ui/side-panel.tsx`) — slide-over from the right; used for **viewing/editing existing records** (keeps list context visible)
- `Modal` (`src/components/ui/modal.tsx`) — centered focused dialog; used for **creates and confirmations**

Both are portal-based (not native `<dialog>`) because native `<dialog>` clips absolutely-positioned popovers from inside `Select`/`Combobox`. Critical: the focus-trap effect inside these components must depend only on `open` — including `onClose` in deps causes the panel to re-focus on every parent re-render and steals focus from inputs (see commit `d1d1480`).

`Select` (`src/components/ui/select.tsx`) itself also portals its dropdown to `document.body` with fixed positioning (and flips to open upward when there isn't room below). This is necessary because dashboard `<main>` regions use `overflow-y-auto`, which would otherwise clip dropdowns on rows near the bottom — that's the bug behind the "role selector hidden on active members" reports. Anything new that needs a popover behavior inside scrollable lists should follow the same portal-plus-trigger-rect pattern.

### Sidebar badges are driven by one query

`getShellCounts(userId)` in `src/server/queries/shell.ts` returns every count surfaced as a badge (pending requests, approvals awaiting me, unconfirmed assignments, equipment issues, open incidents, pending users, pending join requests, unread notifications). The dashboard layout (`src/app/(dashboard)/layout.tsx`) fetches this once and passes counts to the `Shell`, which threads them into `Sidebar.countForHref()`. Add new badges by extending this query and the switch in the sidebar.

### Email via Resend with graceful degradation

`src/lib/email/index.ts` — `sendEmail()` is a thin wrapper around the Resend SDK. When `RESEND_API_KEY` is missing it **no-ops** (logs to server console) so the app keeps working in dev. Templates live in `src/lib/email/templates.ts` as inline-HTML functions (no React-email dependency); they mirror the in-app monochrome palette.

### Onboarding system

Composed of several wired-together pieces — when changing any one, check the others:
- `users.onboarded_at`, `users.invited_at`, `users.accepted_invite_at` distinguish flow states
- `getOnboardingState()` + `buildChecklist()` (`src/server/queries/onboarding.ts`) drive the dashboard's `GettingStarted` card
- `WelcomeModal` only shows when `users.onboarded_at IS NULL`
- Sub-team self-service: `sub_team_join_requests` table + `src/server/actions/join-requests/` — non-members see "Request to join" on `/sub-teams`; leads/admins see pending requests panel and get notified

### Supabase typing quirk

Supabase's TS types return `[]` for joined relationships even when the FK is single. Throughout the codebase you'll see `as unknown as Parameters<typeof Component>[0]["prop"]` casts when passing nested fetches into client components (e.g. `src/app/(dashboard)/sub-teams/page.tsx`). Use that pattern; it's intentional.

## Required environment variables (Vercel)

| Var | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Anon Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (for invites) | Admin Supabase client — invites + cancel |
| `RESEND_API_KEY` | recommended | Outbound email; no-op without it |
| `RESEND_FROM` | optional | e.g. `CCI MediaOps <noreply@yourdomain.com>` — defaults to `onboarding@resend.dev` |
| `NEXT_PUBLIC_APP_URL` | optional | Used in email CTAs and invite redirect — defaults to `https://cci-mediaops.vercel.app` |
