-- CCI MediaOps - RLS Policies
-- Enables authenticated users to read their own data and operational data
-- Idempotent: each policy is created only if it doesn't already exist

do $$
begin

  -- Users: read own record
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'Users can read own record') then
    create policy "Users can read own record" on users for select using (auth.uid() = auth_user_id);
  end if;

  -- Users: update own record
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'Users can update own record') then
    create policy "Users can update own record" on users for update using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);
  end if;

  -- Campus Memberships: read own
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campus_memberships' and policyname = 'Users can read own campus memberships') then
    create policy "Users can read own campus memberships" on campus_memberships for select using (auth.uid() = (select auth_user_id from users where id = user_id));
  end if;

  -- Sub-Team Memberships: read own
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sub_team_memberships' and policyname = 'Users can read own sub-team memberships') then
    create policy "Users can read own sub-team memberships" on sub_team_memberships for select using (auth.uid() = (select auth_user_id from users where id = user_id));
  end if;

  -- Notifications: read own
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'Users can read own notifications') then
    create policy "Users can read own notifications" on notifications for select using (auth.uid() = (select auth_user_id from users where id = user_id));
  end if;

  -- Events: read all (authenticated)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'Authenticated users can read events') then
    create policy "Authenticated users can read events" on events for select to authenticated using (true);
  end if;

  -- Requests: read all (authenticated)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'requests' and policyname = 'Authenticated users can read requests') then
    create policy "Authenticated users can read requests" on requests for select to authenticated using (true);
  end if;

  -- Equipment Items: read all (authenticated)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment_items' and policyname = 'Authenticated users can read equipment') then
    create policy "Authenticated users can read equipment" on equipment_items for select to authenticated using (true);
  end if;

  -- Incidents: read all (authenticated)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'incidents' and policyname = 'Authenticated users can read incidents') then
    create policy "Authenticated users can read incidents" on incidents for select to authenticated using (true);
  end if;

  -- Roles: read all (authenticated)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'roles' and policyname = 'Authenticated users can read roles') then
    create policy "Authenticated users can read roles" on roles for select to authenticated using (true);
  end if;

  -- Campuses: read all (authenticated)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campuses' and policyname = 'Authenticated users can read campuses') then
    create policy "Authenticated users can read campuses" on campuses for select to authenticated using (true);
  end if;

end;
$$;
