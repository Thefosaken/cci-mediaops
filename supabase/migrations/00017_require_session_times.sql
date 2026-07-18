-- ═══════════════════════════════════════════════════════════════════════════
--  00017 · Require Session Times — MIGRATION  (COMMITS — changes are permanent)
--  Suggested SQL Editor tab name:  00017 Require Session Times
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The "needs times" tray is being removed from the UI, so a session can no longer
-- exist without times. This backfills the sessions that migrated from the old
-- run_sheet_segments without a start (the old UI never captured one) and then makes
-- both columns required.
--
-- Backfill strategy: sequential 30-minute slots from 09:00 on the sheet's own date,
-- in the order the segments were created. That preserves the running order the sheet
-- already had rather than inventing one, and puts everything somewhere visible and
-- obviously provisional for a lead to drag into place.
--
-- Safe to re-run: the backfill only touches rows that are still null.

-- ── 1. Backfill ──────────────────────────────────────────────────────────
do $$
declare
  v_session record;
  v_cursor  timestamptz;
  v_sheet   uuid := null;
begin
  for v_session in
    select s.id, s.run_sheet_id, s.created_at,
           coalesce(rs.sheet_date, current_date) as anchor_date
      from run_sheet_sessions s
      join run_sheets rs on rs.id = s.run_sheet_id
     where s.start_time is null
     order by s.run_sheet_id, s.created_at
  loop
    -- Restart the clock for each sheet.
    if v_sheet is distinct from v_session.run_sheet_id then
      v_sheet  := v_session.run_sheet_id;
      v_cursor := v_session.anchor_date + time '09:00';
    end if;

    update run_sheet_sessions
       set start_time = v_cursor,
           end_time   = v_cursor + interval '30 minutes',
           updated_at = now()
     where id = v_session.id;

    -- Gapless, so the exclusion constraint is satisfied and the result reads as a
    -- continuous running order.
    v_cursor := v_cursor + interval '30 minutes';
  end loop;
end;
$$;

-- ── 2. Require times ─────────────────────────────────────────────────────
-- The paired-null check becomes meaningless once both columns are NOT NULL, and the
-- partial WHERE on the exclusion constraint would never exclude anything. Both are
-- rebuilt without those allowances so the schema states the rule plainly.

do $$
begin
  if exists (select 1 from run_sheet_sessions where start_time is null or end_time is null) then
    raise exception 'Some sessions still have no times — backfill did not complete';
  end if;
end;
$$;

alter table run_sheet_sessions drop constraint if exists run_sheet_sessions_times_paired;
alter table run_sheet_sessions drop constraint if exists run_sheet_sessions_no_overlap;
alter table run_sheet_sessions drop constraint if exists run_sheet_sessions_end_after_start;

alter table run_sheet_sessions alter column start_time set not null;
alter table run_sheet_sessions alter column end_time   set not null;

alter table run_sheet_sessions
  add constraint run_sheet_sessions_end_after_start
  check (end_time > start_time);

-- Half-open [start, end) as before: touching edges are not an overlap.
alter table run_sheet_sessions
  add constraint run_sheet_sessions_no_overlap
  exclude using gist (
    run_sheet_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  );

-- ── Confirm ──────────────────────────────────────────────────────────────
select
  count(*)                                    as sessions,
  count(*) filter (where start_time is null)  as still_unplaced,
  min(start_time)                             as earliest,
  max(end_time)                               as latest
from run_sheet_sessions;
