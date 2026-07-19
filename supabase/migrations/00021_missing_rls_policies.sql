-- ============================================================
--  00021_missing_rls_policies.sql
--  Add RLS policies to tables that had RLS enabled but none defined
-- ============================================================
--
-- `alter table ... enable row level security` with zero policies denies every
-- operation to every role except service_role. Nine tables were left in that
-- state by 00001, so the app was silently failing against them:
--
--   * request_sub_teams  — routing a request to sub-teams never persisted, and
--                          reads returned empty, so "group by sub-team" put
--                          every request under "Ungrouped".
--   * comments           — the activity thread could neither load nor post.
--   * event_sub_teams    — assigning teams to an event did not stick.
--   * equipment_assignments, attachment_links, audit_logs, permissions,
--     role_permissions — same, to varying visible effect.
--
-- Nothing errored loudly because PostgREST returns an empty relation rather
-- than a failure when a nested select is denied, and the client code did not
-- check the error on the follow-up insert.
--
-- Policies match the permissive model the rest of the schema already uses
-- (see 00003–00005): any authenticated user may read, and write where the
-- application writes. Role enforcement lives in the application layer, per
-- CLAUDE.md — this migration does not change that posture, it only stops the
-- database from denying everything.
--
-- Idempotent: safe to re-run.
--
-- Every loop below skips tables that do not exist. `organizations` was dropped
-- in 00011 but its `enable row level security` still sits in 00001, so reading
-- the migrations in order without accounting for later drops names a table that
-- is long gone. The guard makes this script correct against whatever the
-- database actually contains rather than what the migration history implies.
-- ============================================================

-- Tables the app both reads and writes.
do $$
declare
  t text;
  tables text[] := array[
    'request_sub_teams',
    'event_sub_teams',
    'equipment_assignments',
    'comments',
    'attachment_links'
  ];
begin
  foreach t in array tables loop
    continue when to_regclass('public.' || t) is null;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and policyname = 'Authenticated users can read ' || t
    ) then
      execute format(
        'create policy %I on %I for select to authenticated using (true)',
        'Authenticated users can read ' || t, t
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and policyname = 'Authenticated users can insert ' || t
    ) then
      execute format(
        'create policy %I on %I for insert to authenticated with check (true)',
        'Authenticated users can insert ' || t, t
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and policyname = 'Authenticated users can update ' || t
    ) then
      execute format(
        'create policy %I on %I for update to authenticated using (true) with check (true)',
        'Authenticated users can update ' || t, t
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and policyname = 'Authenticated users can delete ' || t
    ) then
      execute format(
        'create policy %I on %I for delete to authenticated using (true)',
        'Authenticated users can delete ' || t, t
      );
    end if;

  end loop;
end $$;

-- Reference data the app reads but never writes from the client.
-- Kept read-only deliberately: nothing should be editing the permission matrix
-- through the anon/authenticated key.
--
-- `organizations` is intentionally absent — 00011 dropped it when the schema
-- was localised to a single campus.
do $$
declare
  t text;
  tables text[] := array['permissions', 'role_permissions'];
begin
  foreach t in array tables loop
    continue when to_regclass('public.' || t) is null;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and policyname = 'Authenticated users can read ' || t
    ) then
      execute format(
        'create policy %I on %I for select to authenticated using (true)',
        'Authenticated users can read ' || t, t
      );
    end if;
  end loop;
end $$;

-- Audit logs: append-only from the app's point of view. Readable so admin
-- screens can show history; insertable so actions can record themselves; no
-- update or delete policy, so an audit trail cannot be rewritten through the
-- client key.
do $$
begin
  if to_regclass('public.audit_logs') is null then
    return;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs'
      and policyname = 'Authenticated users can read audit_logs'
  ) then
    create policy "Authenticated users can read audit_logs"
      on audit_logs for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs'
      and policyname = 'Authenticated users can insert audit_logs'
  ) then
    create policy "Authenticated users can insert audit_logs"
      on audit_logs for insert to authenticated with check (true);
  end if;
end $$;

-- ── Verify ──────────────────────────────────────────────────
-- Should return zero rows. Any row is a table still denying everything.
select c.relname as table_without_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )
order by c.relname;
