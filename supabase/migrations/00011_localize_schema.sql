-- CCI MediaOps — Localize schema to single-campus
--
-- Removes global/multi-organization abstractions that were created for
-- future multi-campus support but are not needed for the single-campus pilot.
-- See /docs/global-to-local-architecture.md for the full rationale and
-- re-instatement guide.
--
-- Changes:
--   1. Drop `organizations` table (FK on campuses → remove column first)
--   2. Remove `organization_id` from `campuses`
--   3. Remove `'global'` from `roles.scope` check constraint
--   4. Rewrite `handle_new_auth_user()` to stop referencing organizations
--   5. Drop RLS policy on organizations (table dropped)
--   6. Update the super_admin role seed to use 'campus' scope instead of 'global'

-- ── 1. Remove organization_id FK + column from campuses ──────────────────
alter table public.campuses
  drop constraint if exists campuses_organization_id_fkey;

alter table public.campuses
  drop column if exists organization_id;

-- ── 2. Drop organizations table ─────────────────────────────────────────
drop table if exists public.organizations cascade;

-- ── 3. Update super_admin role scope from 'global' to 'campus' ──────────
update public.roles
  set scope = 'campus'
  where name = 'super_admin' and scope = 'global';

-- ── 4. Remove 'global' from roles.scope check constraint ────────────────
alter table public.roles
  drop constraint if exists roles_scope_check;

alter table public.roles
  add constraint roles_scope_check
    check (scope in ('campus', 'sub_team'));

-- ── 5. Rewrite handle_new_auth_user (last defined in 00008) ───────────
--    No longer creates an organization. Campuses exist without an org parent.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  user_count int;
  v_campus_id uuid;
  super_admin_role_id uuid;
  new_user_id uuid;
  existing_id uuid;
  existing_invited timestamptz;
  sub_team_names text[] := array['Projection', 'Videography', 'Photography', 'Design', 'Lighting', 'Sound', 'Social Media'];
  team_name text;
begin
  select id, invited_at into existing_id, existing_invited
  from public.users where email = new.email;

  if existing_id is not null then
    update public.users
       set auth_user_id = new.id,
           full_name = coalesce(new.raw_user_meta_data ->> 'full_name', full_name),
           phone = coalesce(nullif(new.raw_user_meta_data ->> 'phone', ''), phone),
           status = case when status in ('suspended','inactive') then 'pending' else status end,
           accepted_invite_at = case
             when existing_invited is not null and accepted_invite_at is null then now()
             else accepted_invite_at
           end
     where id = existing_id;
    new_user_id := existing_id;
  else
    insert into public.users (auth_user_id, full_name, email, phone, status)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
      new.email,
      nullif(new.raw_user_meta_data ->> 'phone', ''),
      'pending'
    )
    returning id into new_user_id;
  end if;

  select count(*) into user_count from public.users;

  if user_count = 1 then
    -- First user: bootstrap campus/sub-teams and self-promote to super_admin
    update public.users set status = 'active', onboarded_at = now() where id = new_user_id;

    insert into public.campuses (name, location, status)
    values ('Pilot Campus', null, 'active') returning id into v_campus_id;

    select id into super_admin_role_id from public.roles where name = 'super_admin';

    if super_admin_role_id is not null then
      insert into public.campus_memberships (campus_id, user_id, role_id, status)
      values (v_campus_id, new_user_id, super_admin_role_id, 'active');
    end if;

    foreach team_name in array sub_team_names loop
      insert into public.sub_teams (campus_id, name, status)
      values (v_campus_id, team_name, 'active');
    end loop;
  else
    -- Subsequent users: attach a pending membership to the (first) active campus
    select id into v_campus_id from public.campuses where status = 'active' order by created_at asc limit 1;
    if v_campus_id is not null and not exists (
      select 1 from public.campus_memberships where user_id = new_user_id
    ) then
      insert into public.campus_memberships (campus_id, user_id, role_id, status)
      values (v_campus_id, new_user_id, null, 'pending');
    end if;
  end if;

  return new;
end;
$$;
