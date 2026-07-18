-- ═══════════════════════════════════════════════════════════════════════════
--  00016 · Drop Legacy Scheduling — MIGRATION  (COMMITS — IRREVERSIBLE)
--  Suggested SQL Editor tab name:  00016 Drop Legacy Scheduling
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ⚠  RUN THIS LAST — after testing the timeline, and only then.
--
--  This is the only destructive step in the run sheet work. It permanently drops
--  run_sheet_segments and schedule_slots. There is no undo: if the timeline turns out
--  to have a problem, the old data is gone and the old UI cannot be restored by
--  reverting code alone.
--
--  Everything else (00013, 00014, 00015) is additive and safe. Nothing in the app reads
--  these two tables any more, so leaving them in place costs nothing but a little
--  clutter. There is no deadline on running this.
--
--  Before running, confirm you have:
--    • opened the timeline and placed a session
--    • edited a session's time and seen the cascade preview
--    • run live mode start to finish
--    • duplicated a sheet and created one from a template
--
--  See docs/runsheet-scheduling-unification.md §7

-- ── Safety check ─────────────────────────────────────────────────────────
-- Refuses to run if no sessions exist, which would mean 00013 never applied or the
-- migration is being run against the wrong database.
do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'run_sheet_sessions') then
    raise exception 'run_sheet_sessions does not exist — apply 00013 first';
  end if;

  if not exists (select 1 from run_sheet_sessions) then
    raise exception 'run_sheet_sessions is empty — refusing to drop the legacy tables';
  end if;
end;
$$;

-- ── Drop ─────────────────────────────────────────────────────────────────
-- cascade clears the dependent RLS policies and indexes along with each table.
drop table if exists schedule_slots cascade;
drop table if exists run_sheet_segments cascade;

-- ── Confirm ──────────────────────────────────────────────────────────────
select
  to_regclass('public.schedule_slots')      as schedule_slots_should_be_null,
  to_regclass('public.run_sheet_segments')  as segments_should_be_null,
  (select count(*) from run_sheet_sessions) as sessions_remaining;
