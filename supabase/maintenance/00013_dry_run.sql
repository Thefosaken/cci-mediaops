-- ═══════════════════════════════════════════════════════════════════════════
--  00013 · Run Sheet Sessions — DRY RUN  (ROLLS BACK — nothing is saved)
--  Suggested SQL Editor tab name:  00013 DRY RUN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Every statement executes for real, then the transaction is discarded.
-- Safe to run against production. Generated from:
--   supabase/migrations/00013_runsheet_sessions.sql

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
--  00013 · Run Sheet Sessions — MIGRATION  (COMMITS — changes are permanent)
--  Suggested SQL Editor tab name:  00013 Run Sheet Sessions
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CCI MediaOps - Run Sheet / Scheduling Unification
--
-- Makes run sheets standalone (no event required), replaces run_sheet_segments with
-- interval-based run_sheet_sessions, moves cues to per-sub-team rows, and absorbs
-- schedule_slots into session members.
--
-- Idempotent. Non-destructive: run_sheet_segments and schedule_slots are left in place
-- and are dropped by a later migration, one release after this ships.
--
-- See docs/runsheet-scheduling-unification.md

-- Required for the exclusion constraint below: lets a GiST index mix the uuid equality
-- operator with the range overlap operator in one constraint.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- 1. run_sheets: decouple from events
-- ---------------------------------------------------------------------------

alter table run_sheets alter column event_id drop not null;

alter table run_sheets add column if not exists campus_id uuid references campuses(id) on delete cascade;
alter table run_sheets add column if not exists is_template boolean not null default false;
alter table run_sheets add column if not exists template_source_id uuid references run_sheets(id) on delete set null;
alter table run_sheets add column if not exists sheet_date date;

-- Backfill campus from the linked event before campus_id becomes required.
update run_sheets rs
set campus_id = e.campus_id
from events e
where rs.event_id = e.id
  and rs.campus_id is null;

-- Any sheet still without a campus has no event to inherit from; fall back to the
-- active campus so the column can be made NOT NULL.
update run_sheets
set campus_id = (select id from campuses where status = 'active' order by created_at asc limit 1)
where campus_id is null;

do $$
begin
  if exists (select 1 from run_sheets where campus_id is not null)
     and not exists (select 1 from run_sheets where campus_id is null) then
    alter table run_sheets alter column campus_id set not null;
  end if;
end;
$$;

-- Give existing sheets a date to anchor their timeline columns.
update run_sheets rs
set sheet_date = (e.start_time at time zone 'UTC')::date
from events e
where rs.event_id = e.id
  and rs.sheet_date is null;

-- ---------------------------------------------------------------------------
-- 2. run_sheet_sessions
-- ---------------------------------------------------------------------------
--
-- Times are nullable as a pair: a session is either placed on the timeline (both set)
-- or parked in the "needs times" tray (both null). Parking lives in this table rather
-- than a separate one so a parked session keeps its cues and members, and placing it
-- is a plain UPDATE.

create table if not exists run_sheet_sessions (
  id uuid primary key default gen_random_uuid(),
  run_sheet_id uuid not null references run_sheets(id) on delete cascade,
  name text not null,
  start_time timestamptz,
  end_time timestamptz,
  session_type text,
  notes text,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Both set, or neither. No half-placed sessions.
  constraint run_sheet_sessions_times_paired
    check ((start_time is null) = (end_time is null)),

  -- Zero-length and inverted sessions are always wrong.
  constraint run_sheet_sessions_end_after_start
    check (start_time is null or end_time > start_time)
);

-- Half-open intervals [start, end). A session ending 08:30 and one starting 08:30 do
-- not overlap. Scoped per run sheet, and skipped entirely for parked sessions.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'run_sheet_sessions_no_overlap'
  ) then
    alter table run_sheet_sessions
      add constraint run_sheet_sessions_no_overlap
      exclude using gist (
        run_sheet_id with =,
        tstzrange(start_time, end_time, '[)') with &&
      ) where (start_time is not null and end_time is not null);
  end if;
end;
$$;

create index if not exists idx_run_sheet_sessions_sheet on run_sheet_sessions(run_sheet_id);
create index if not exists idx_run_sheet_sessions_start on run_sheet_sessions(run_sheet_id, start_time);

-- ---------------------------------------------------------------------------
-- 3. run_sheet_session_cues — one row per sub-team per session
-- ---------------------------------------------------------------------------

create table if not exists run_sheet_session_cues (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references run_sheet_sessions(id) on delete cascade,
  sub_team_id uuid not null references sub_teams(id) on delete cascade,
  cue_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, sub_team_id)
);

create index if not exists idx_run_sheet_session_cues_session on run_sheet_session_cues(session_id);

-- ---------------------------------------------------------------------------
-- 4. run_sheet_session_members — absorbs schedule_slots
-- ---------------------------------------------------------------------------
--
-- user_id is nullable so a role can be rostered before a person is named
-- ("camera op needed here, unassigned") — a case schedule_slots supported.

create table if not exists run_sheet_session_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references run_sheet_sessions(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  sub_team_id uuid references sub_teams(id) on delete set null,
  role_title text,
  call_time timestamptz,
  confirmation_status text not null default 'pending'
    check (confirmation_status in ('pending', 'confirmed', 'declined', 'replacement_needed')),
  attendance_status text
    check (attendance_status in ('present', 'absent', 'late', 'excused')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per real person per session; several unfilled slots are allowed.
create unique index if not exists idx_run_sheet_session_members_unique_user
  on run_sheet_session_members (session_id, user_id)
  where user_id is not null;

create index if not exists idx_run_sheet_session_members_session on run_sheet_session_members(session_id);
create index if not exists idx_run_sheet_session_members_user on run_sheet_session_members(user_id);

-- Drives the sidebar unconfirmed-assignments badge.
create index if not exists idx_run_sheet_session_members_pending
  on run_sheet_session_members (user_id, confirmation_status)
  where confirmation_status = 'pending';

-- ---------------------------------------------------------------------------
-- 5. Migrate run_sheet_segments -> run_sheet_sessions
-- ---------------------------------------------------------------------------
--
-- Segments with both a start and a duration are placed on the timeline. Segments
-- missing either are parked with null times rather than guessed at.

do $$
begin
  if not exists (select 1 from run_sheet_sessions) then

    insert into run_sheet_sessions (
      id, run_sheet_id, name, start_time, end_time, session_type, notes, status, created_at, updated_at
    )
    select
      seg.id,
      seg.run_sheet_id,
      seg.title,
      case
        when seg.planned_start_time is not null and seg.estimated_duration_minutes is not null
        then seg.planned_start_time
      end,
      case
        when seg.planned_start_time is not null and seg.estimated_duration_minutes is not null
             and seg.estimated_duration_minutes > 0
        then seg.planned_start_time + (seg.estimated_duration_minutes * interval '1 minute')
      end,
      seg.segment_type,
      -- owner_name was free text and has no equivalent column; fold it into notes so
      -- it is not silently lost before a lead can reassign it to a real user.
      case
        when seg.owner_name is not null and seg.owner_name <> ''
        then coalesce(seg.notes || E'\n', '') || 'Owner (migrated): ' || seg.owner_name
        else seg.notes
      end,
      seg.status,
      seg.created_at,
      seg.updated_at
    from run_sheet_segments seg
    -- Skip anything that would violate the paired-times check.
    where not (
      seg.planned_start_time is not null
      and seg.estimated_duration_minutes is not null
      and seg.estimated_duration_minutes <= 0
    );

  end if;
end;
$$;

-- Old cue columns -> per-sub-team cue rows, matched by sub-team name within the
-- session's own campus. camera_cue maps to Videography.
do $$
declare
  cue_map text[][] := array[
    ['projection_cue',   'Projection'],
    ['sound_cue',        'Sound'],
    ['lighting_cue',     'Lighting'],
    ['camera_cue',       'Videography'],
    ['social_media_cue', 'Social Media']
  ];
  i integer;
begin
  if not exists (select 1 from run_sheet_session_cues) then
    for i in 1 .. array_length(cue_map, 1) loop
      execute format($f$
        insert into run_sheet_session_cues (session_id, sub_team_id, cue_text)
        select s.id, st.id, seg.%I
        from run_sheet_segments seg
        join run_sheet_sessions s on s.id = seg.id
        join run_sheets rs on rs.id = s.run_sheet_id
        join sub_teams st on st.campus_id = rs.campus_id and st.name = %L
        where seg.%I is not null and seg.%I <> ''
        on conflict (session_id, sub_team_id) do nothing
      $f$, cue_map[i][1], cue_map[i][2], cue_map[i][1], cue_map[i][1]);
    end loop;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Migrate schedule_slots -> run_sheet_session_members
-- ---------------------------------------------------------------------------
--
-- Slots are attached to an event, not to a session, so there is no natural target.
-- Each event's slots are collected onto a single parked session on that event's run
-- sheet, for a lead to distribute onto real sessions. Confirmation and attendance
-- state is preserved. Events without a run sheet get one created.

do $$
declare
  slot_event record;
  v_sheet_id uuid;
  v_session_id uuid;
begin
  if not exists (
    select 1 from run_sheet_session_members where notes = 'Migrated from schedule_slots'
  ) then

    for slot_event in
      select distinct e.id as event_id, e.title, e.campus_id, (e.start_time at time zone 'UTC')::date as event_date
      from schedule_slots ss
      join events e on e.id = ss.event_id
    loop

      select id into v_sheet_id
      from run_sheets
      where event_id = slot_event.event_id and is_template = false
      order by created_at asc
      limit 1;

      if v_sheet_id is null then
        insert into run_sheets (event_id, campus_id, title, status, sheet_date)
        values (slot_event.event_id, slot_event.campus_id,
                slot_event.title || ' — Run Sheet', 'draft', slot_event.event_date)
        returning id into v_sheet_id;
      end if;

      insert into run_sheet_sessions (run_sheet_id, name, status, notes)
      values (v_sheet_id, 'Crew assignments (migrated)', 'upcoming',
              'Imported from scheduling. Assign these people to real sessions, then delete this placeholder.')
      returning id into v_session_id;

      insert into run_sheet_session_members (
        session_id, user_id, sub_team_id, role_title, call_time,
        confirmation_status, attendance_status, notes, created_at, updated_at
      )
      select
        v_session_id, ss.assigned_user_id, ss.sub_team_id, ss.role_title, ss.call_time,
        ss.confirmation_status, ss.attendance_status,
        'Migrated from schedule_slots', ss.created_at, ss.updated_at
      from schedule_slots ss
      where ss.event_id = slot_event.event_id;

    end loop;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
--
-- Permissive, matching 00010 and the project-wide pattern documented in CLAUDE.md:
-- reads are open to authenticated users and role enforcement lives in server actions
-- via hasPermission(). Tightening these in isolation would break consistency with
-- every other table.

alter table run_sheet_sessions enable row level security;
alter table run_sheet_session_cues enable row level security;
alter table run_sheet_session_members enable row level security;

do $$
declare
  t text;
  tables text[] := array['run_sheet_sessions', 'run_sheet_session_cues', 'run_sheet_session_members'];
begin
  foreach t in array tables loop

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'Authenticated users can read ' || t) then
      execute format('create policy %I on %I for select to authenticated using (true)', 'Authenticated users can read ' || t, t);
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'Authenticated users can insert ' || t) then
      execute format('create policy %I on %I for insert to authenticated with check (true)', 'Authenticated users can insert ' || t, t);
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'Authenticated users can update ' || t) then
      execute format('create policy %I on %I for update to authenticated using (true) with check (true)', 'Authenticated users can update ' || t, t);
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'Authenticated users can delete ' || t) then
      execute format('create policy %I on %I for delete to authenticated using (true)', 'Authenticated users can delete ' || t, t);
    end if;

  end loop;
end;
$$;

-- ── verification: one row, so the editor shows it all ────────
select
  (select count(*) from run_sheet_sessions)                    as sessions_total,
  (select count(start_time) from run_sheet_sessions)           as placed,
  (select count(*) from run_sheet_sessions
    where start_time is null)                                  as parked,
  (select count(*) from run_sheet_session_cues)                as cues,
  (select count(*) from run_sheet_session_members)             as members,
  (select count(*) from run_sheets where campus_id is null)    as missing_campus;

ROLLBACK;
