-- ═══════════════════════════════════════════════════════════════════════════
--  00014 · Session Cascade RPC — MIGRATION  (COMMITS — changes are permanent)
--  Suggested SQL Editor tab name:  00014 Session Cascade RPC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Applies a whole cascade (the edited session plus every session it displaces) in one
-- transaction.
--
-- Why this exists: supabase-js has no BEGIN/COMMIT, so a multi-row cascade issued from
-- the client would be several independent statements. That fails outright — shifting a
-- session forward makes it overlap the next one's current slot, and the exclusion
-- constraint from 00013 rejects the intermediate state.
--
-- The fix is ordering. Moves are applied back-to-front: the last session in the chain
-- moves first, into empty space beyond the sheet; the one before it then moves into the
-- space just vacated, and so on, with the edited session moving last. A forward cascade
-- never collides when applied this way, so no constraint deferral is needed.
--
-- (If cascades ever need to push sessions *backwards*, this ordering argument breaks.
-- The fix then is to recreate the exclusion constraint as DEFERRABLE and wrap the loop
-- in SET CONSTRAINTS ... DEFERRED, which tolerates any intermediate state.)
--
-- See docs/runsheet-scheduling-unification.md §2

create or replace function apply_session_cascade(
  p_run_sheet_id uuid,
  -- [{ "id": uuid, "start_time": timestamptz, "end_time": timestamptz }, ...]
  -- in timeline order: the edited session first, then each displaced session.
  p_moves jsonb
)
returns integer
language plpgsql
-- security invoker: the caller's RLS applies, same as a direct update would.
security invoker
set search_path = public
as $$
declare
  v_move    jsonb;
  v_applied integer := 0;
  v_count   integer;
begin
  if jsonb_typeof(p_moves) <> 'array' then
    raise exception 'apply_session_cascade: p_moves must be a JSON array';
  end if;

  -- Back to front. jsonb array indexes are 0-based, hence the -1.
  for v_move in
    select p_moves -> i
    from generate_series(jsonb_array_length(p_moves) - 1, 0, -1) as i
  loop
    update run_sheet_sessions
       set start_time = (v_move ->> 'start_time')::timestamptz,
           end_time   = (v_move ->> 'end_time')::timestamptz,
           updated_at = now()
     where id = (v_move ->> 'id')::uuid
       -- Scoping to the sheet stops a crafted payload moving sessions on another sheet.
       and run_sheet_id = p_run_sheet_id;

    get diagnostics v_count = row_count;
    v_applied := v_applied + v_count;
  end loop;

  -- A short payload means an id was wrong or belonged to another sheet. Raising here
  -- rolls the whole cascade back rather than leaving the sheet half-shifted.
  if v_applied <> jsonb_array_length(p_moves) then
    raise exception 'apply_session_cascade: expected % moves, applied %',
      jsonb_array_length(p_moves), v_applied;
  end if;

  return v_applied;
end;
$$;

comment on function apply_session_cascade(uuid, jsonb) is
  'Applies a run sheet cascade atomically, back to front so the overlap constraint is never violated mid-sequence.';
