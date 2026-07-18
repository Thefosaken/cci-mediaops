-- ═══════════════════════════════════════════════════════════════════════════
--  00015 · Duplicate Run Sheet — MIGRATION  (COMMITS — changes are permanent)
--  Suggested SQL Editor tab name:  00015 Duplicate Run Sheet
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Copies a run sheet with all its sessions, cues and member assignments. Backs three
-- features: Duplicate, Save as template, and Create from template.
--
-- Done in SQL rather than the client because a copy spans four tables. A partial copy
-- from a failed sequence of client calls would leave sessions without their cues, and
-- nothing would flag it.
--
-- Rebasing: when p_target_date is given, every session shifts by whole days, which
-- preserves both clock times and the gaps between sessions — including a session that
-- runs past midnight, which keeps its relative position rather than being clamped.
--
-- See docs/runsheet-scheduling-unification.md §5

create or replace function duplicate_run_sheet(
  p_source_id    uuid,
  p_title        text,
  p_as_template  boolean default false,
  -- Null keeps the source's times exactly. Otherwise sessions move onto this date.
  p_target_date  date default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source     run_sheets%rowtype;
  v_new_id     uuid;
  v_anchor     date;
  v_shift      interval := interval '0';
  v_session    record;
  v_new_sess   uuid;
begin
  select * into v_source from run_sheets where id = p_source_id;
  if not found then
    raise exception 'duplicate_run_sheet: run sheet % not found', p_source_id;
  end if;

  if p_target_date is not null then
    -- Anchor on the first placed session, falling back to the sheet's own date.
    select (min(start_time) at time zone 'UTC')::date
      into v_anchor
      from run_sheet_sessions
     where run_sheet_id = p_source_id and start_time is not null;

    v_anchor := coalesce(v_anchor, v_source.sheet_date);

    if v_anchor is not null then
      v_shift := (p_target_date - v_anchor) * interval '1 day';
    end if;
  end if;

  insert into run_sheets (
    event_id, campus_id, title, status, is_template, template_source_id, sheet_date, created_by
  )
  values (
    -- A template is not tied to the original's event; a plain duplicate keeps it.
    case when p_as_template then null else v_source.event_id end,
    v_source.campus_id,
    p_title,
    'draft',
    p_as_template,
    p_source_id,
    coalesce(p_target_date, v_source.sheet_date),
    v_source.created_by
  )
  returning id into v_new_id;

  -- One session at a time so each new id is known when its cues and members are copied.
  -- Volumes here are a few dozen rows at most.
  for v_session in
    select * from run_sheet_sessions where run_sheet_id = p_source_id order by start_time nulls last
  loop
    insert into run_sheet_sessions (
      run_sheet_id, name, start_time, end_time, session_type, notes, status
    )
    values (
      v_new_id,
      v_session.name,
      v_session.start_time + v_shift,
      v_session.end_time + v_shift,
      v_session.session_type,
      v_session.notes,
      -- A copy is always fresh, whatever state the original reached.
      'upcoming'
    )
    returning id into v_new_sess;

    insert into run_sheet_session_cues (session_id, sub_team_id, cue_text)
    select v_new_sess, sub_team_id, cue_text
      from run_sheet_session_cues
     where session_id = v_session.id;

    insert into run_sheet_session_members (
      session_id, user_id, sub_team_id, role_title, call_time,
      confirmation_status, attendance_status
    )
    select
      v_new_sess, user_id, sub_team_id, role_title,
      call_time + v_shift,
      -- Critically NOT copied: a past confirmation says nothing about a new date, and
      -- carrying it over would show people as confirmed for a service they never saw.
      'pending',
      null
      from run_sheet_session_members
     where session_id = v_session.id;
  end loop;

  return v_new_id;
end;
$$;

comment on function duplicate_run_sheet(uuid, text, boolean, date) is
  'Copies a run sheet with sessions, cues and members. Resets confirmations; optionally rebases onto a new date.';
