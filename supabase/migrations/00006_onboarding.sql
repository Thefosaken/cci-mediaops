-- CCI MediaOps — Onboarding flow
-- 1. Track first-time vs returning users so the welcome flow runs once.
-- 2. Self-service sub-team join requests with lead/admin approval.
-- 3. Update the auth trigger so non-first users get a pending campus_membership
--    on sign-up (admins can then assign role without a missing-FK race).

-- ── 1. users.onboarded_at ───────────────────────────────────────────────
alter table public.users
  add column if not exists onboarded_at timestamptz;

-- ── 1b. Allow null role_id on campus_memberships ────────────────────────
-- A pending membership has no role yet — the admin assigns one on approval.
alter table public.campus_memberships
  alter column role_id drop not null;

-- ── 2. sub_team_join_requests ───────────────────────────────────────────
create table if not exists public.sub_team_join_requests (
  id uuid primary key default gen_random_uuid(),
  sub_team_id uuid not null references public.sub_teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  message text,
  status text not null default 'pending', -- pending | approved | rejected | cancelled
  decided_by uuid references public.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_join_request_unique_pending
  on public.sub_team_join_requests(sub_team_id, user_id)
  where status = 'pending';

create index if not exists idx_join_requests_status on public.sub_team_join_requests(status);
create index if not exists idx_join_requests_team on public.sub_team_join_requests(sub_team_id);
create index if not exists idx_join_requests_user on public.sub_team_join_requests(user_id);

-- updated_at trigger (mirrors the pattern used by other tables)
create or replace function public.touch_join_request()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_touch_join_request on public.sub_team_join_requests;
create trigger trg_touch_join_request
  before update on public.sub_team_join_requests
  for each row execute function public.touch_join_request();

-- ── 3. RLS for sub_team_join_requests ───────────────────────────────────
alter table public.sub_team_join_requests enable row level security;

do $$
begin
  -- A user can read their own requests; leads/admins read all (handled at app level).
  -- For simplicity in this internal app: any authenticated user can read all requests.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sub_team_join_requests'
      and policyname = 'Authenticated users can read join requests'
  ) then
    create policy "Authenticated users can read join requests"
      on public.sub_team_join_requests for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sub_team_join_requests'
      and policyname = 'Authenticated users can insert join requests'
  ) then
    create policy "Authenticated users can insert join requests"
      on public.sub_team_join_requests for insert to authenticated with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sub_team_join_requests'
      and policyname = 'Authenticated users can update join requests'
  ) then
    create policy "Authenticated users can update join requests"
      on public.sub_team_join_requests for update to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sub_team_join_requests'
      and policyname = 'Authenticated users can delete join requests'
  ) then
    create policy "Authenticated users can delete join requests"
      on public.sub_team_join_requests for delete to authenticated using (true);
  end if;
end;
$$;

-- ── 4. Update handle_new_auth_user to seed a pending campus_membership ──
-- Non-first users get a pending membership with no role yet. The admin
-- approval flow can then update role_id + status without an upsert race.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  user_count int;
  org_id uuid;
  v_campus_id uuid;
  super_admin_role_id uuid;
  new_user_id uuid;
  sub_team_names text[] := array['Projection', 'Videography', 'Photography', 'Design', 'Lighting', 'Sound', 'Social Media'];
  team_name text;
begin
  -- 1. Create public.users row
  insert into public.users (auth_user_id, full_name, email, phone, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'pending'
  )
  returning id into new_user_id;

  select count(*) into user_count from public.users;

  if user_count = 1 then
    -- First user: bootstrap org/campus/sub-teams and self-promote to super_admin.
    update public.users set status = 'active', onboarded_at = now() where id = new_user_id;

    insert into public.organizations (name)
    values ('Celebration Church International') returning id into org_id;

    insert into public.campuses (organization_id, name, location, status)
    values (org_id, 'Pilot Campus', null, 'active') returning id into v_campus_id;

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
    -- Subsequent users: attach a pending membership to the (first) active campus.
    -- App-level approval flow updates role_id and flips status to 'active'.
    select id into v_campus_id from public.campuses where status = 'active' order by created_at asc limit 1;
    if v_campus_id is not null then
      insert into public.campus_memberships (campus_id, user_id, role_id, status)
      values (v_campus_id, new_user_id, null, 'pending');
    end if;
  end if;

  return new;
end;
$$;
