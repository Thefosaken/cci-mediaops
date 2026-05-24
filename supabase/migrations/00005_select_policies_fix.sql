-- CCI MediaOps - RLS Policies (Missing Selects)
-- Fixes missing read access for core operational tables

do $$
begin

  -- Sub-Teams: read all (authenticated)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sub_teams' and policyname = 'Authenticated users can read sub-teams') then
    create policy "Authenticated users can read sub-teams" on sub_teams for select to authenticated using (true);
  end if;

  -- Tasks: read all (authenticated)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'Authenticated users can read tasks') then
    create policy "Authenticated users can read tasks" on tasks for select to authenticated using (true);
  end if;

  -- Schedule Slots: read all (authenticated)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_slots' and policyname = 'Authenticated users can read schedule slots') then
    create policy "Authenticated users can read schedule slots" on schedule_slots for select to authenticated using (true);
  end if;

  -- Approvals: read all (authenticated)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'approvals' and policyname = 'Authenticated users can read approvals') then
    create policy "Authenticated users can read approvals" on approvals for select to authenticated using (true);
  end if;

end;
$$;
