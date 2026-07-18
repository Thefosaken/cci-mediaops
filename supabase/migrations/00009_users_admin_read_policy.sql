-- CCI MediaOps — relax users/memberships SELECT policies
--
-- 00003 only granted "read your own row" on public.users and
-- public.campus_memberships. That made Settings → Users & access empty
-- for admins (including super_admin) and forced the sidebar pending-user
-- badge to 0, so new self-signups never surfaced to anyone.
--
-- Match the rest of the schema (events, requests, sub-teams, …) and the
-- philosophy in CLAUDE.md: permissive reads inside an authenticated session,
-- gates enforced by server-action checks.

do $$
begin

  -- users: any authenticated user can read every row.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'Authenticated users can read users'
  ) then
    create policy "Authenticated users can read users"
      on users for select to authenticated using (true);
  end if;

  -- campus_memberships: same — needed so the Settings page can join role_id
  -- and the dashboard layout can pull role/campus for any user it surfaces.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'campus_memberships'
      and policyname = 'Authenticated users can read campus memberships'
  ) then
    create policy "Authenticated users can read campus memberships"
      on campus_memberships for select to authenticated using (true);
  end if;

  -- sub_team_memberships: parallel to campus_memberships so lead/admin views
  -- can see who is on which sub-team.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sub_team_memberships'
      and policyname = 'Authenticated users can read sub team memberships'
  ) then
    create policy "Authenticated users can read sub team memberships"
      on sub_team_memberships for select to authenticated using (true);
  end if;

end;
$$;
