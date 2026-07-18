-- ═══════════════════════════════════════════════════════════════════════════
--  00018 · Duty Assignments — MIGRATION  (COMMITS — changes are permanent)
--  Suggested SQL Editor tab name:  00018 Duty Assignments
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Rostering: who is on duty, for which team, on which day.
--
-- This is deliberately NOT run_sheet_session_members. That table answers "who is on
-- this item of this service", and only exists once a run sheet has been built with its
-- sessions laid out. Rostering happens weeks earlier and at day granularity — a lead
-- planning August needs to put someone on the 17th before anyone has written that
-- Sunday's run sheet.
--
-- So duty is its own concept, anchored to a date. An event_id links it to a service
-- when one exists, but is not required: you can roster a date the calendar knows
-- nothing else about yet.
--
-- See docs/runsheet-scheduling-unification.md §7 for why schedule_slots was retired —
-- it was event-shaped in the wrong way and never used.

-- ── 1. Per-team colour ───────────────────────────────────────────────────
-- The calendar overlays every team at once, the way Google overlays accounts, so each
-- team needs a stable identity colour rather than one derived from list position.
alter table sub_teams add column if not exists color text;

do $$
declare
  palette text[] := array['blue', 'violet', 'emerald', 'amber', 'rose', 'cyan', 'orange'];
  t record;
  i integer := 1;
begin
  for t in select id from sub_teams where color is null order by created_at, name loop
    update sub_teams set color = palette[((i - 1) % array_length(palette, 1)) + 1] where id = t.id;
    i := i + 1;
  end loop;
end;
$$;

-- ── 2. Duty assignments ──────────────────────────────────────────────────

create table if not exists duty_assignments (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses(id) on delete cascade,
  sub_team_id uuid not null references sub_teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,

  -- The day being rostered. Always present, so a duty can exist before its service does.
  duty_date date not null,
  -- Linked when the day has a real event. Cleared rather than deleted if the event goes,
  -- because the person is still rostered for that date.
  event_id uuid references events(id) on delete set null,

  role_title text,
  -- Time of day they are expected, when it differs from the service start.
  call_time time,

  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'declined', 'swapped_out')),
  notes text,

  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One duty per person per team per day. Someone can serve two teams on the same
-- Sunday — projection in the morning, sound in the evening — but not be double-booked
-- within one team.
create unique index if not exists idx_duty_unique_person_team_day
  on duty_assignments (user_id, sub_team_id, duty_date);

create index if not exists idx_duty_campus_date on duty_assignments (campus_id, duty_date);
create index if not exists idx_duty_user_date on duty_assignments (user_id, duty_date);
create index if not exists idx_duty_team_date on duty_assignments (sub_team_id, duty_date);
create index if not exists idx_duty_event on duty_assignments (event_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────
-- Permissive, matching the project-wide pattern documented in CLAUDE.md: reads are
-- open to authenticated users and role enforcement lives in server actions.

alter table duty_assignments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'duty_assignments' and policyname = 'Authenticated read duty_assignments') then
    create policy "Authenticated read duty_assignments" on duty_assignments for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'duty_assignments' and policyname = 'Authenticated insert duty_assignments') then
    create policy "Authenticated insert duty_assignments" on duty_assignments for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'duty_assignments' and policyname = 'Authenticated update duty_assignments') then
    create policy "Authenticated update duty_assignments" on duty_assignments for update to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'duty_assignments' and policyname = 'Authenticated delete duty_assignments') then
    create policy "Authenticated delete duty_assignments" on duty_assignments for delete to authenticated using (true);
  end if;
end;
$$;

-- ── Confirm ──────────────────────────────────────────────────────────────
select
  (select count(*) from sub_teams where color is not null) as teams_with_colour,
  (select count(*) from sub_teams)                          as teams,
  (select count(*) from duty_assignments)                   as duties;
