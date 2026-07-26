-- ═══════════════════════════════════════════════════════════════════════════
--  00023 · Run Sheet Share Links — MIGRATION  (COMMITS — permanent)
--  Suggested SQL Editor tab name:  00023 Run Sheet Share Links
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A read-only link to a run sheet's live view, for a screen that is not signed in.
--
-- The real case: a tablet taped to the front-of-house desk, a phone in the green room,
-- a laptop the guest speaker's producer is watching. None of those people have — or
-- should be given — an account on an internal operations tool, and passing a login
-- around a building is how a media team ends up sharing one password forever.
--
-- ── Why the token is the whole gate ──────────────────────────────────────
-- The link is a bearer credential: whoever holds it can read the sheet. That is the
-- intended behaviour, so the design leans on making the token unguessable and
-- revocable rather than pretending it is an identity.
--
--   · 24 characters from a 36-symbol alphabet ≈ 124 bits. Not brute-forceable.
--   · `is_active` makes revocation instant and, unlike deleting the row, keeps the
--     record of who created it and how often it was opened.
--   · Optional `expires_at`, because a link for one Sunday should not outlive it.
--
-- RLS deliberately stays `to authenticated`, matching the project-wide pattern. The
-- anonymous visitor never touches this table directly — the public route reads it with
-- the service-role client, so there is no policy that an unauthenticated caller could
-- exploit to enumerate links.

create table if not exists run_sheet_share_links (
  id uuid primary key default gen_random_uuid(),
  run_sheet_id uuid not null references run_sheets(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,

  token text not null unique,
  label text not null default '',

  is_active boolean not null default true,
  expires_at timestamptz,

  -- Evidence the link is actually being used, and by how many screens. A lead who
  -- shares a link and sees zero views knows the tablet never loaded it.
  view_count integer not null default 0,
  last_viewed_at timestamptz,

  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live link per sheet. Several would mean revoking a leak requires finding every
-- link that exists, and the honest answer to "is this sheet shared" has to be one row.
-- Rotating is revoke-then-create, which is a deliberate act rather than an accident.
create unique index if not exists idx_share_links_one_active_per_sheet
  on run_sheet_share_links (run_sheet_id) where is_active;

create index if not exists idx_share_links_token on run_sheet_share_links (token);

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table run_sheet_share_links enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'run_sheet_share_links' and policyname = 'Authenticated read run_sheet_share_links') then
    create policy "Authenticated read run_sheet_share_links" on run_sheet_share_links for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'run_sheet_share_links' and policyname = 'Authenticated insert run_sheet_share_links') then
    create policy "Authenticated insert run_sheet_share_links" on run_sheet_share_links for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'run_sheet_share_links' and policyname = 'Authenticated update run_sheet_share_links') then
    create policy "Authenticated update run_sheet_share_links" on run_sheet_share_links for update to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'run_sheet_share_links' and policyname = 'Authenticated delete run_sheet_share_links') then
    create policy "Authenticated delete run_sheet_share_links" on run_sheet_share_links for delete to authenticated using (true);
  end if;
end;
$$;

-- ── View counting ────────────────────────────────────────────────────────
-- A security-definer function so the public route can record a view without being
-- handed write access to the table. It takes a token and returns nothing useful — an
-- invalid token is indistinguishable from a valid one here, so it cannot be used to
-- probe which tokens exist.

create or replace function record_share_link_view(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update run_sheet_share_links
     set view_count = view_count + 1,
         last_viewed_at = now()
   where token = p_token
     and is_active
     and (expires_at is null or expires_at > now());
end;
$$;

-- ── Confirm ──────────────────────────────────────────────────────────────
select
  (select count(*) from run_sheet_share_links)                                        as share_links,
  (select count(*) from pg_indexes where indexname = 'idx_share_links_one_active_per_sheet') as one_per_sheet_index,
  (select count(*) from pg_proc where proname = 'record_share_link_view')             as view_counter;
