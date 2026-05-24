-- CCI MediaOps — Make handle_new_auth_user idempotent for re-signups
--
-- If a public.users row already exists for the email (orphaned by a previous
-- auth.users deletion, or a re-signup after admin cleanup), the previous
-- version of this trigger would throw `duplicate key value violates unique
-- constraint "users_email_key"`. This version updates the existing row in
-- place to point at the new auth_user_id instead.
--
-- Also guards the pending campus_membership insert so a re-signup doesn't
-- duplicate that row either.

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
  existing_id uuid;
  sub_team_names text[] := array['Projection', 'Videography', 'Photography', 'Design', 'Lighting', 'Sound', 'Social Media'];
  team_name text;
begin
  -- Re-link orphan public.users row if email already exists, else insert fresh.
  select id into existing_id from public.users where email = new.email;

  if existing_id is not null then
    update public.users
       set auth_user_id = new.id,
           full_name = coalesce(new.raw_user_meta_data ->> 'full_name', full_name),
           phone = coalesce(nullif(new.raw_user_meta_data ->> 'phone', ''), phone),
           status = case when status in ('suspended','inactive') then 'pending' else status end
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
    -- Only seed a pending campus_membership when the user doesn't already have one.
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
