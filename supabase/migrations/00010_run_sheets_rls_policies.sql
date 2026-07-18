-- CCI MediaOps - RLS Policies for Run Sheets
-- Enables authenticated users to read, create, and update run sheets and segments
-- Idempotent: each policy is created only if it doesn't already exist

do $$
begin

  -- Run Sheets: select
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'run_sheets' and policyname = 'Authenticated users can read run sheets') then
    create policy "Authenticated users can read run sheets" on run_sheets for select to authenticated using (true);
  end if;

  -- Run Sheets: insert
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'run_sheets' and policyname = 'Authenticated users can insert run sheets') then
    create policy "Authenticated users can insert run sheets" on run_sheets for insert to authenticated with check (true);
  end if;

  -- Run Sheets: update
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'run_sheets' and policyname = 'Authenticated users can update run sheets') then
    create policy "Authenticated users can update run sheets" on run_sheets for update to authenticated using (true) with check (true);
  end if;

  -- Run Sheet Segments: select
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'run_sheet_segments' and policyname = 'Authenticated users can read run sheet segments') then
    create policy "Authenticated users can read run sheet segments" on run_sheet_segments for select to authenticated using (true);
  end if;

  -- Run Sheet Segments: insert
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'run_sheet_segments' and policyname = 'Authenticated users can insert run sheet segments') then
    create policy "Authenticated users can insert run sheet segments" on run_sheet_segments for insert to authenticated with check (true);
  end if;

  -- Run Sheet Segments: update
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'run_sheet_segments' and policyname = 'Authenticated users can update run sheet segments') then
    create policy "Authenticated users can update run sheet segments" on run_sheet_segments for update to authenticated using (true) with check (true);
  end if;

end;
$$;
