-- ═══════════════════════════════════════════════════════════════════════════
--  00025 · Team & Campus Codes — MIGRATION  (COMMITS — permanent)
--  Suggested SQL Editor tab name:  00025 Team & Campus Codes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds a short, human-readable `code` to campuses and teams so equipment asset
-- tags can be auto-generated in the form  CAMPUS-TEAM-NNN  (e.g. CCIB-PROJ-001).
--
-- ── Why a stored code instead of deriving from the name ──────────────────
-- "Projection" → "PROJ" is easy, but "Social Media" → "SOCI" and "Pilot Campus"
-- → "PILO" are not what anyone actually wants on a label. The code is the thing
-- printed on tape and typed into search, so it has to be editable, not guessed
-- every time. We backfill a sensible default from the name and let admins fix it
-- in Settings.
--
-- ── Uniqueness ───────────────────────────────────────────────────────────
-- Team codes must be unique within a campus; campus codes are unique globally
-- (this deployment runs a single campus, and the live `campuses` table has no
-- organization_id column). Partial indexes so only rows with a code set count.
-- ═══════════════════════════════════════════════════════════════════════════

alter table campuses  add column if not exists code text;
alter table sub_teams add column if not exists code text;

-- Backfill: first 4 alphanumerics of the name, uppercased. Admins edit after.
update campuses
   set code = upper(left(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'), 4))
 where code is null and name is not null;

update sub_teams
   set code = upper(left(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'), 4))
 where code is null and name is not null;

create unique index if not exists idx_campuses_code
  on campuses (upper(code))
  where code is not null;

create unique index if not exists idx_sub_teams_code
  on sub_teams (campus_id, upper(code))
  where code is not null;

-- Confirm what happened.
select 'campuses' as scope, name, code from campuses
union all
select 'teams' as scope, name, code from sub_teams
order by scope, name;
