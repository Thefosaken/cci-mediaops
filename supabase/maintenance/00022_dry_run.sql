-- ═══════════════════════════════════════════════════════════════════════════
--  00022 · Event Slots — DRY RUN  (READ ONLY — changes nothing)
--  Suggested SQL Editor tab name:  00022 Dry Run
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Run this BEFORE 00022_event_slots_and_rostering.sql.
--
-- That migration reverses a rule: 00018 deliberately allowed one person to serve two
-- teams on the same day, and 00022 forbids it. Any existing row caught by the reversal
-- is archived into duty_assignment_conflicts and removed from the live table.
--
-- Nothing is lost, but somebody has to be re-rostered, and that is easier to arrange
-- before the rota changes underneath them than after. This script shows exactly who,
-- and changes nothing.
--
-- ── Read §1 first ────────────────────────────────────────────────────────
-- This script describes the world BEFORE 00022 runs, where every duty is day-level
-- because slots do not exist yet. If §1 reports already_migrated = 1, STOP — §2 and
-- §3 assume the pre-migration shape and will overstate the damage on a database that
-- has already been migrated.

-- ── 1. Preconditions ─────────────────────────────────────────────────────
-- btree_gist carries the uuid and date equality operators the exclusion constraint
-- needs. 00013 enabled it; this confirms rather than assumes.

select
  (select count(*) from pg_extension where extname = 'btree_gist')                      as btree_gist_ready,
  (select count(*) from pg_constraint where conname = 'duty_no_double_booking')         as already_migrated,
  (select count(*) from pg_indexes where indexname = 'idx_duty_unique_person_team_day') as old_index_present,
  (select count(*) from pg_tables where tablename = 'event_slots')                      as slots_table_exists,
  (select count(*) from duty_assignments)                                               as total_duties;

-- Reading the result:
--   btree_gist_ready   1 — required. If 0, run `create extension btree_gist;` first.
--   already_migrated   0 — 1 means 00022 has already run. Do not run it again, and
--                          ignore §2 and §3 below.
--   old_index_present  1 — the 00018 index that 00022 replaces. 0 alongside
--                          already_migrated = 0 means something else removed it;
--                          investigate before going on.

-- ── 2. Who would be displaced ────────────────────────────────────────────
-- Every duty that would be archived, with the duty that displaces it. The keeper is
-- the earliest-created row for that person and date — the same rule the migration
-- uses, so this list is exactly what it will act on.
--
-- No slot filter: before 00022 there is no slot_id column, and every duty is day-level
-- by definition. That is precisely why they collide under the new rule.

with ranked as (
  select d.id,
         d.user_id,
         d.duty_date,
         d.sub_team_id,
         d.created_at,
         row_number() over (partition by d.user_id, d.duty_date order by d.created_at, d.id) as rn
    from duty_assignments d
)
select u.full_name                                    as person,
       r.duty_date                                    as date,
       st.name                                        as team_losing_them,
       (select st2.name
          from ranked k
          join sub_teams st2 on st2.id = k.sub_team_id
         where k.user_id = r.user_id
           and k.duty_date = r.duty_date
           and k.rn = 1)                              as team_keeping_them,
       r.created_at                                   as rostered_on
  from ranked r
  join users u      on u.id  = r.user_id
  join sub_teams st on st.id = r.sub_team_id
 where r.rn > 1
 order by r.duty_date, u.full_name;

-- An empty result here is the good outcome: nobody is double-teamed on any day, and
-- 00022 will archive nothing.

-- ── 3. The damage, in one line ───────────────────────────────────────────

with ranked as (
  select user_id, duty_date,
         row_number() over (partition by user_id, duty_date order by created_at, id) as rn
    from duty_assignments
)
select count(*)                  as duties_to_archive,
       count(distinct user_id)   as people_affected,
       count(distinct duty_date) as dates_affected
  from ranked
 where rn > 1;
