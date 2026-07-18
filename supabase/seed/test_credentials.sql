-- CCI MediaOps — Test Credentials Seed
--
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor) AFTER
-- at least one person has signed up (so the campus/roles exist).
--
-- Creates 6 test users with different roles for permission testing.
-- All passwords are: test123456

-- ── clean up any previous run ────────────────────────────────────
delete from public.notifications  where user_id in (select id from public.users where email like '%@test.cci');
delete from public.sub_team_memberships where user_id in (select id from public.users where email like '%@test.cci');
delete from public.campus_memberships where user_id in (select id from public.users where email like '%@test.cci');
delete from public.users where email like '%@test.cci';
delete from auth.users where email like '%@test.cci';

begin;

do $$ declare
  _campus_id uuid;

  _role_sa      uuid;
  _role_ma      uuid;
  _role_stl     uuid;
  _role_al      uuid;
  _role_tm      uuid;
  _role_rq      uuid;

  _uid_sa       uuid;
  _uid_ma       uuid;
  _uid_stl      uuid;
  _uid_al       uuid;
  _uid_tm       uuid;
  _uid_rq       uuid;

  _pid_sa       uuid;
  _pid_ma       uuid;
  _pid_stl      uuid;
  _pid_al       uuid;
  _pid_tm       uuid;
  _pid_rq       uuid;

  _st_proj      uuid;
  _st_video     uuid;
  _st_sound     uuid;
begin

  -- pick the first campus (assumes at least one sign-up happened)
  select id into _campus_id from public.campuses limit 1;
  if _campus_id is null then
    raise exception 'No campus found – sign up first, then run this seed.';
  end if;

  -- role ids
  select id into _role_sa  from public.roles where name = 'super_admin';
  select id into _role_ma  from public.roles where name = 'media_admin';
  select id into _role_stl from public.roles where name = 'sub_team_lead';
  select id into _role_al  from public.roles where name = 'assistant_lead';
  select id into _role_tm  from public.roles where name = 'team_member';
  select id into _role_rq  from public.roles where name = 'requester';

  -- ── 1. auth users ──────────────────────────────────────────────
  _uid_sa := gen_random_uuid();
  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values (
    _uid_sa, '00000000-0000-0000-0000-000000000000',
    'superadmin@test.cci', crypt('test123456', gen_salt('bf', 8)),
    now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Super Admin"}',
    now(), now(), '', '', '', ''
  );

  _uid_ma := gen_random_uuid();
  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values (
    _uid_ma, '00000000-0000-0000-0000-000000000000',
    'mediaadmin@test.cci', crypt('test123456', gen_salt('bf', 8)),
    now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Media Admin"}',
    now(), now(), '', '', '', ''
  );

  _uid_stl := gen_random_uuid();
  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values (
    _uid_stl, '00000000-0000-0000-0000-000000000000',
    'teamlead@test.cci', crypt('test123456', gen_salt('bf', 8)),
    now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Team Lead"}',
    now(), now(), '', '', '', ''
  );

  _uid_al := gen_random_uuid();
  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values (
    _uid_al, '00000000-0000-0000-0000-000000000000',
    'assistantlead@test.cci', crypt('test123456', gen_salt('bf', 8)),
    now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Assistant Lead"}',
    now(), now(), '', '', '', ''
  );

  _uid_tm := gen_random_uuid();
  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values (
    _uid_tm, '00000000-0000-0000-0000-000000000000',
    'teammember@test.cci', crypt('test123456', gen_salt('bf', 8)),
    now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Team Member"}',
    now(), now(), '', '', '', ''
  );

  _uid_rq := gen_random_uuid();
  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values (
    _uid_rq, '00000000-0000-0000-0000-000000000000',
    'requester@test.cci', crypt('test123456', gen_salt('bf', 8)),
    now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Requester"}',
    now(), now(), '', '', '', ''
  );

  -- ── 2. public.users (the trigger should handle this, but insert directly too) ──
  insert into public.users (id, auth_user_id, full_name, email, status, created_at, updated_at)
  values
    (gen_random_uuid(), _uid_sa, 'Test Super Admin',    'superadmin@test.cci',    'active', now(), now()),
    (gen_random_uuid(), _uid_ma, 'Test Media Admin',    'mediaadmin@test.cci',    'active', now(), now()),
    (gen_random_uuid(), _uid_stl, 'Test Team Lead',     'teamlead@test.cci',      'active', now(), now()),
    (gen_random_uuid(), _uid_al, 'Test Assistant Lead', 'assistantlead@test.cci', 'active', now(), now()),
    (gen_random_uuid(), _uid_tm, 'Test Team Member',    'teammember@test.cci',    'active', now(), now()),
    (gen_random_uuid(), _uid_rq, 'Test Requester',      'requester@test.cci',     'active', now(), now())
  on conflict (auth_user_id) do nothing;

  -- fetch public user ids
  select id into _pid_sa from public.users where auth_user_id = _uid_sa;
  select id into _pid_ma from public.users where auth_user_id = _uid_ma;
  select id into _pid_stl from public.users where auth_user_id = _uid_stl;
  select id into _pid_al from public.users where auth_user_id = _uid_al;
  select id into _pid_tm from public.users where auth_user_id = _uid_tm;
  select id into _pid_rq from public.users where auth_user_id = _uid_rq;

  -- ── 3. campus_memberships ──────────────────────────────────────
  insert into public.campus_memberships (campus_id, user_id, role_id, status, created_at, updated_at)
  values
    (_campus_id, _pid_sa, _role_sa, 'active', now(), now()),
    (_campus_id, _pid_ma, _role_ma, 'active', now(), now()),
    (_campus_id, _pid_stl, _role_stl, 'active', now(), now()),
    (_campus_id, _pid_al, _role_al, 'active', now(), now()),
    (_campus_id, _pid_tm, _role_tm, 'active', now(), now()),
    (_campus_id, _pid_rq, _role_rq, 'active', now(), now());

  -- ── 4. sub-teams + memberships ─────────────────────────────────
  insert into public.sub_teams (campus_id, name, description, status, created_at, updated_at)
  values
    (_campus_id, 'Projection',  'Visuals and on-screen projection', 'active', now(), now()),
    (_campus_id, 'Videography', 'Camera operation and video recording', 'active', now(), now()),
    (_campus_id, 'Sound',       'Audio mixing and engineering', 'active', now(), now())
  ;

  select id into _st_proj  from public.sub_teams where name = 'Projection' and campus_id = _campus_id;
  select id into _st_video from public.sub_teams where name = 'Videography' and campus_id = _campus_id;
  select id into _st_sound from public.sub_teams where name = 'Sound' and campus_id = _campus_id;

  insert into public.sub_team_memberships (sub_team_id, user_id, role_id, status, created_at, updated_at)
  values
    (_st_proj,  _pid_stl, _role_stl, 'active', now(), now()),
    (_st_video, _pid_al,  _role_al,  'active', now(), now()),
    (_st_sound, _pid_tm,  _role_tm,  'active', now(), now());

end $$;

commit;

-- ── summary ──────────────────────────────────────────────────────
select
  u.email as "Email",
  r.name  as "Role"
from auth.users au
join public.users u on u.auth_user_id = au.id
join public.campus_memberships cm on cm.user_id = u.id
join public.roles r on r.id = cm.role_id
where au.email like '%@test.cci'
order by u.email;
