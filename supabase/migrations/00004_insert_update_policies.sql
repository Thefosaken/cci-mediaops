-- CCI MediaOps - RLS Policies (Insert & Update)
-- Enables authenticated users to create and modify operational data
-- Idempotent: each policy is created only if it doesn't already exist

do $$
begin

  -- Sub-Teams
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sub_teams' and policyname = 'Authenticated users can insert sub-teams') then
    create policy "Authenticated users can insert sub-teams" on sub_teams for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sub_teams' and policyname = 'Authenticated users can update sub-teams') then
    create policy "Authenticated users can update sub-teams" on sub_teams for update to authenticated using (true) with check (true);
  end if;

  -- Sub-Team Memberships
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sub_team_memberships' and policyname = 'Authenticated users can insert sub-team memberships') then
    create policy "Authenticated users can insert sub-team memberships" on sub_team_memberships for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sub_team_memberships' and policyname = 'Authenticated users can update sub-team memberships') then
    create policy "Authenticated users can update sub-team memberships" on sub_team_memberships for update to authenticated using (true) with check (true);
  end if;

  -- Campus Memberships
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campus_memberships' and policyname = 'Authenticated users can update campus memberships') then
    create policy "Authenticated users can update campus memberships" on campus_memberships for update to authenticated using (true) with check (true);
  end if;
  
  -- Users (Insert is handled by auth trigger, but we need general update for admins approving users)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'Authenticated users can update users') then
    create policy "Authenticated users can update users" on users for update to authenticated using (true) with check (true);
  end if;

  -- Events
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'Authenticated users can insert events') then
    create policy "Authenticated users can insert events" on events for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'Authenticated users can update events') then
    create policy "Authenticated users can update events" on events for update to authenticated using (true) with check (true);
  end if;

  -- Requests
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'requests' and policyname = 'Authenticated users can insert requests') then
    create policy "Authenticated users can insert requests" on requests for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'requests' and policyname = 'Authenticated users can update requests') then
    create policy "Authenticated users can update requests" on requests for update to authenticated using (true) with check (true);
  end if;

  -- Tasks
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'Authenticated users can insert tasks') then
    create policy "Authenticated users can insert tasks" on tasks for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'Authenticated users can update tasks') then
    create policy "Authenticated users can update tasks" on tasks for update to authenticated using (true) with check (true);
  end if;

  -- Equipment Items
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment_items' and policyname = 'Authenticated users can insert equipment') then
    create policy "Authenticated users can insert equipment" on equipment_items for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment_items' and policyname = 'Authenticated users can update equipment') then
    create policy "Authenticated users can update equipment" on equipment_items for update to authenticated using (true) with check (true);
  end if;

  -- Incidents
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'incidents' and policyname = 'Authenticated users can insert incidents') then
    create policy "Authenticated users can insert incidents" on incidents for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'incidents' and policyname = 'Authenticated users can update incidents') then
    create policy "Authenticated users can update incidents" on incidents for update to authenticated using (true) with check (true);
  end if;

  -- Schedule Slots
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_slots' and policyname = 'Authenticated users can insert schedule slots') then
    create policy "Authenticated users can insert schedule slots" on schedule_slots for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_slots' and policyname = 'Authenticated users can update schedule slots') then
    create policy "Authenticated users can update schedule slots" on schedule_slots for update to authenticated using (true) with check (true);
  end if;

  -- Approvals
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'approvals' and policyname = 'Authenticated users can insert approvals') then
    create policy "Authenticated users can insert approvals" on approvals for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'approvals' and policyname = 'Authenticated users can update approvals') then
    create policy "Authenticated users can update approvals" on approvals for update to authenticated using (true) with check (true);
  end if;

end;
$$;
