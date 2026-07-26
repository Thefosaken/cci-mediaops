-- ═══════════════════════════════════════════════════════════════════════════
--  00022 · Event Slots & Slot-Aware Rostering — MIGRATION  (COMMITS — permanent)
--  Suggested SQL Editor tab name:  00022 Event Slots
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds the missing rung on the ladder.
--
-- Today the model jumps straight from a day (duty_assignments.duty_date) to an item
-- inside a built run sheet (run_sheet_session_members). There is nothing in between,
-- so a Sunday with a first and second service has no way to say which service someone
-- is on. Slots are that rung: an event owns up to four of them, and a duty points at
-- one.
--
-- Four is a hard ceiling, expressed as `slot_order between 1 and 4` plus a unique
-- index on (campus_id, slot_date, slot_order). No counting trigger, no race — the
-- fifth insert simply has nowhere to go.
--
-- Position is scoped to the DAY, not to the event. Slot 1 means "the day's first
-- service" whoever owns it. This matters because the clash rule below compares
-- positions within a date: were positions per-event, a Sunday Service at position 1
-- and a Youth Night at position 1 would collide, and somebody serving the morning
-- could not also serve the evening. Scoping to the day makes the two distinct
-- positions, which is what they are.
--
-- ── The clash rule ──────────────────────────────────────────────────────────
-- One person holds at most one duty per slot, across every team. Serving Projection
-- at first service and Sound at second is fine; being on two teams inside the same
-- service is not. A duty with no slot means "all day" and blocks every slot that day.
--
-- This REVERSES the decision recorded in 00018, which shipped a unique index on
-- (user_id, sub_team_id, duty_date) with a comment explicitly allowing someone to
-- serve two teams on the same Sunday. That index is dropped in §5. Existing rows that
-- violate the new rule are archived, not deleted — see §6.
--
-- Enforcement is an exclusion constraint rather than application code because two
-- leads rostering concurrently can both pass a client-side check and both commit.

create extension if not exists btree_gist;

-- ── 1. Slots ─────────────────────────────────────────────────────────────
-- `slot_date` is stored rather than derived from start_time. A timestamptz renders to
-- a different calendar day either side of midnight depending on the reader's zone, and
-- the roster's notion of "which Sunday" must not drift with it. run_sheets.sheet_date
-- already exists for exactly this reason — same pattern.

create table if not exists event_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,

  -- "First Service", "Second Service", "Evening" — what a lead calls it out loud.
  label text not null,
  -- 1–4. Both the display order and the identity used by the clash constraint.
  slot_order smallint not null check (slot_order between 1 and 4),

  slot_date date not null,
  start_time timestamptz not null,
  end_time timestamptz,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_slots_end_after_start check (end_time is null or end_time > start_time),
  -- Scoped to the day, not the event — see the header note on why the clash rule
  -- depends on it. Four positions per campus per day, whoever owns them.
  constraint event_slots_unique_position unique (campus_id, slot_date, slot_order)
);

create index if not exists idx_event_slots_event on event_slots (event_id, slot_order);
create index if not exists idx_event_slots_date on event_slots (campus_id, slot_date);

-- ── 2. What each slot needs ──────────────────────────────────────────────
-- Drives the coverage view: "Camera 1 of 2", "Sound unfilled". Without a stated
-- requirement a gap is invisible — an empty team looks identical to a team that was
-- never needed.

create table if not exists event_slot_requirements (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references event_slots(id) on delete cascade,
  sub_team_id uuid not null references sub_teams(id) on delete cascade,
  needed_count smallint not null default 1 check (needed_count between 0 and 50),
  created_at timestamptz not null default now(),
  constraint event_slot_requirements_unique unique (slot_id, sub_team_id)
);

create index if not exists idx_slot_requirements_slot on event_slot_requirements (slot_id);

-- ── 2b. Run sheets belong to a service, not just a day ───────────────────
-- A Sunday with two services has two run sheets against one event_id and one date, so
-- event_id + sheet_date no longer identifies a sheet. Without this the calendar would
-- have to match sheets by title, which breaks the moment somebody renames one.
--
-- `set null` rather than cascade: if a slot is removed the sheet is still a real
-- document somebody wrote, and deleting their work as a side effect of tidying the
-- schedule would be indefensible. It falls back to being a standalone sheet.
alter table run_sheets add column if not exists slot_id uuid
  references event_slots(id) on delete set null;

create index if not exists idx_run_sheets_slot on run_sheets (slot_id)
  where slot_id is not null;

-- One sheet per service. A second is a mis-click, and two sheets for one service is
-- worse than none — the team ends up following different pages.
create unique index if not exists idx_run_sheets_one_per_slot
  on run_sheets (slot_id) where slot_id is not null and is_template = false;

-- ── 3. Recurring events ──────────────────────────────────────────────────
-- Occurrences are real, independent rows sharing a group id, not a rule evaluated at
-- read time. A church moves one week's service without moving the other fifty-one,
-- and materialised rows make that an ordinary edit instead of an exception table.

alter table events add column if not exists recurrence_group_id uuid;
create index if not exists idx_events_recurrence on events (recurrence_group_id)
  where recurrence_group_id is not null;

-- ── 4. Slot-aware, publishable duties ────────────────────────────────────

alter table duty_assignments add column if not exists slot_id uuid
  references event_slots(id) on delete cascade;

-- Denormalised from event_slots.slot_order, kept in sync by trigger (§7). The
-- exclusion constraint needs the order in the row itself: a generated column cannot
-- reach into another table, and a subquery is not immutable.
alter table duty_assignments add column if not exists slot_no smallint;

-- Existing rows default to 'published' so nothing already rostered disappears from
-- anyone's calendar when this runs. Only the batch-build flow opts into 'draft'.
alter table duty_assignments add column if not exists publish_state text not null
  default 'published' check (publish_state in ('draft', 'published'));
alter table duty_assignments add column if not exists published_at timestamptz;

update duty_assignments
   set published_at = created_at
 where published_at is null and publish_state = 'published';

create index if not exists idx_duty_slot on duty_assignments (slot_id);
create index if not exists idx_duty_draft on duty_assignments (campus_id, publish_state)
  where publish_state = 'draft';

-- The span a duty occupies within its day. A slotted duty covers just its own slot;
-- an unslotted one covers [1,5) — every slot — which is what makes "all day" block
-- everything without needing a second constraint or any special-casing.
alter table duty_assignments add column if not exists slot_span int4range
  generated always as (
    case when slot_no is null then int4range(1, 5)
         else int4range(slot_no, slot_no + 1)
    end
  ) stored;

-- ── 5. Retire the old rule ───────────────────────────────────────────────
-- 00018's index permitted exactly what we now forbid, so it cannot simply coexist.
drop index if exists idx_duty_unique_person_team_day;

-- ── 6. Archive rows the new rule would reject ────────────────────────────
-- Adding an exclusion constraint over violating data fails outright, and an
-- exclusion constraint cannot be added NOT VALID. So conflicts are resolved first:
-- the earliest-created duty in each clashing group is kept, the rest are copied into
-- an archive table and removed. Nothing is destroyed, and §9 reports the count so the
-- operator can see whether anyone needs re-rostering.

-- `LIKE` without INCLUDING GENERATED copies slot_span as a plain int4range column,
-- which is what an archive wants: a frozen record of what the row was, not a column
-- that recomputes. It also keeps the column order identical to duty_assignments, so
-- the `d.*` insert below lines up without naming thirty columns.
create table if not exists duty_assignment_conflicts (
  like duty_assignments including defaults,
  archived_at timestamptz not null default now(),
  archived_reason text not null default 'superseded by 00022 per-slot clash rule'
);

do $$
declare
  victims uuid[];
begin
  -- Pre-migration rows are all unslotted, so every duty a person holds on a given
  -- date collides. Rank by created_at and keep the first.
  select coalesce(array_agg(id), '{}') into victims
  from (
    select id,
           row_number() over (partition by user_id, duty_date order by created_at, id) as rn
      from duty_assignments
     where slot_id is null
  ) ranked
  where rn > 1;

  if array_length(victims, 1) > 0 then
    insert into duty_assignment_conflicts
      select d.*, now(), 'superseded by 00022 per-slot clash rule'
        from duty_assignments d
       where d.id = any(victims);

    delete from duty_assignments where id = any(victims);

    raise notice '00022: archived % duty rows that clashed under the new per-slot rule', array_length(victims, 1);
  end if;
end;
$$;

-- ── 7. Keep slot_no and duty_date true to the slot ───────────────────────
-- Two columns could drift from the slot they point at, and a drifted slot_no means
-- the clash constraint guards the wrong thing. Both are derived here rather than
-- trusted from the caller.

create or replace function sync_duty_from_slot() returns trigger as $$
declare
  s record;
begin
  if new.slot_id is null then
    new.slot_no := null;
    return new;
  end if;

  select slot_order, slot_date into s from event_slots where id = new.slot_id;
  if not found then
    raise exception 'Slot % does not exist', new.slot_id;
  end if;

  new.slot_no := s.slot_order;
  new.duty_date := s.slot_date;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_duty_from_slot on duty_assignments;
create trigger trg_sync_duty_from_slot
  before insert or update of slot_id on duty_assignments
  for each row execute function sync_duty_from_slot();

-- Reordering or moving a slot must carry its duties with it, or they keep guarding
-- the old position.
create or replace function resync_duties_on_slot_change() returns trigger as $$
begin
  if new.slot_order is distinct from old.slot_order
     or new.slot_date is distinct from old.slot_date then
    update duty_assignments
       set slot_no = new.slot_order,
           duty_date = new.slot_date,
           updated_at = now()
     where slot_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_resync_duties_on_slot_change on event_slots;
create trigger trg_resync_duties_on_slot_change
  after update of slot_order, slot_date on event_slots
  for each row execute function resync_duties_on_slot_change();

-- ── 8. The clash constraint ──────────────────────────────────────────────
-- Same person, same day, overlapping slot span — rejected, whichever team each duty
-- belongs to. Draft rows are included deliberately: a draft that clashes is a draft
-- that cannot be published, and finding that out at publish time is too late.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'duty_no_double_booking'
  ) then
    alter table duty_assignments
      add constraint duty_no_double_booking
      exclude using gist (
        user_id with =,
        duty_date with =,
        slot_span with &&
      );
  end if;
end;
$$;

-- ── 9. RLS ───────────────────────────────────────────────────────────────
-- Permissive, matching the project-wide pattern in CLAUDE.md: reads open to
-- authenticated users, role enforcement in server actions.

alter table event_slots enable row level security;
alter table event_slot_requirements enable row level security;
alter table duty_assignment_conflicts enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['event_slots', 'event_slot_requirements'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'Authenticated read ' || t) then
      execute format('create policy %I on %I for select to authenticated using (true)', 'Authenticated read ' || t, t);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'Authenticated insert ' || t) then
      execute format('create policy %I on %I for insert to authenticated with check (true)', 'Authenticated insert ' || t, t);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'Authenticated update ' || t) then
      execute format('create policy %I on %I for update to authenticated using (true) with check (true)', 'Authenticated update ' || t, t);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'Authenticated delete ' || t) then
      execute format('create policy %I on %I for delete to authenticated using (true)', 'Authenticated delete ' || t, t);
    end if;
  end loop;

  -- Archive is readable so an admin can see who was displaced; nobody writes to it
  -- except the migration itself.
  if not exists (select 1 from pg_policies where tablename = 'duty_assignment_conflicts' and policyname = 'Authenticated read duty_assignment_conflicts') then
    create policy "Authenticated read duty_assignment_conflicts" on duty_assignment_conflicts for select to authenticated using (true);
  end if;
end;
$$;

-- ── Confirm ──────────────────────────────────────────────────────────────
select
  (select count(*) from event_slots)                                        as slots,
  (select count(*) from event_slot_requirements)                            as requirements,
  (select count(*) from duty_assignments)                                   as duties,
  (select count(*) from duty_assignments where publish_state = 'draft')     as draft_duties,
  (select count(*) from duty_assignment_conflicts)                          as archived_conflicts,
  (select count(*) from pg_constraint where conname = 'duty_no_double_booking') as clash_constraint;
