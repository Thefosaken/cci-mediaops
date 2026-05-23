-- CCI MediaOps - Auth trigger, seed data, and initial setup
-- Creates the auth user sync trigger and seeds default data.

-- 1. Function: handle new auth user
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  user_count int;
  org_id uuid;
  campus_id uuid;
  super_admin_role_id uuid;
  sub_team_names text[] := array['Projection', 'Videography', 'Photography', 'Design', 'Lighting', 'Sound', 'Social Media'];
  team_name text;
begin
  -- Create public.users record
  insert into public.users (auth_user_id, full_name, email, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    'pending'
  );

  -- Check if this is the first user
  select count(*) into user_count from public.users;

  if user_count = 1 then
    -- First user: auto-activate as super_admin
    update public.users
    set status = 'active'
    where auth_user_id = new.id;

    -- Create organization
    insert into public.organizations (name)
    values ('Celebration Church International')
    returning id into org_id;

    -- Create campus
    insert into public.campuses (organization_id, name, location, status)
    values (org_id, 'Pilot Campus', null, 'active')
    returning id into campus_id;

    -- Get super_admin role id
    select id into super_admin_role_id from public.roles where name = 'super_admin';

    -- Create campus membership for first user
    if super_admin_role_id is not null then
      insert into public.campus_memberships (campus_id, user_id, role_id, status)
      select campus_id, u.id, super_admin_role_id, 'active'
      from public.users u where u.auth_user_id = new.id;
    end if;

    -- Create default sub-teams
    foreach team_name in array sub_team_names loop
      insert into public.sub_teams (campus_id, name, status)
      values (campus_id, team_name, 'active');
    end loop;
  end if;

  return new;
end;
$$;

-- 2. Trigger: on auth user insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- 3. Function: sync user email on auth email change
create or replace function public.sync_user_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.users
  set email = new.email
  where auth_user_id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row
  execute function public.sync_user_email();
