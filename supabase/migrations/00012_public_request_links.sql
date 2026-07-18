-- CCI MediaOps — Public request links
--
-- Allows super admins, sub-team leads, and assistants to generate shareable
-- links that external people can use to submit requests without logging in.

-- ── 1. public_request_links ────────────────────────────────────────────
create table if not exists public_request_links (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  sub_team_ids uuid[] not null default '{}',
  created_by uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  label text not null default '',
  is_active boolean not null default true,
  submission_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_public_links_token on public_request_links(token);
create index idx_public_links_campus on public_request_links(campus_id);
create index idx_public_links_created_by on public_request_links(created_by);

-- ── 2. Modify requests to support public submissions ──────────────────
alter table public.requests
  alter column requester_id drop not null;

alter table public.requests
  add column if not exists requester_name text;

alter table public.requests
  add column if not exists requester_contact text;

alter table public.requests
  add column if not exists public_request_link_id uuid
    references public.public_request_links(id) on delete set null;

alter table public.requests
  add column if not exists tracking_id text;

create unique index if not exists idx_requests_tracking_id on public.requests(tracking_id)
  where tracking_id is not null;

-- ── 3. RLS for public_request_links ────────────────────────────────────
alter table public.public_request_links enable row level security;

do $$
begin
  -- Authenticated users can read links
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'public_request_links'
      and policyname = 'Authenticated users can read public request links'
  ) then
    create policy "Authenticated users can read public request links"
      on public.public_request_links for select to authenticated using (true);
  end if;

  -- Authenticated users can create links
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'public_request_links'
      and policyname = 'Authenticated users can insert public request links'
  ) then
    create policy "Authenticated users can insert public request links"
      on public.public_request_links for insert to authenticated with check (true);
  end if;

  -- Authenticated users can update links (deactivate, etc.)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'public_request_links'
      and policyname = 'Authenticated users can update public request links'
  ) then
    create policy "Authenticated users can update public request links"
      on public.public_request_links for update to authenticated using (true) with check (true);
  end if;
end;
$$;

-- ── 4. Add tracking_id and public_request_link_id to request select RLS ─
-- No changes needed — existing policies already allow authenticated reads on requests.
-- The new columns are covered by the same "Authenticated users can read requests" policy.

-- ── 5. Increment RPC for submission_count ────────────────────────────
create or replace function public.increment_public_link_count(link_id uuid)
returns void
language plpgsql
as $$
begin
  update public.public_request_links
  set submission_count = submission_count + 1
  where id = link_id;
end;
$$;

-- ── 6. updated_at trigger ──────────────────────────────────────────────
create or replace function public.touch_public_request_link()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_touch_public_request_link on public.public_request_links;
create trigger trg_touch_public_request_link
  before update on public.public_request_links
  for each row execute function public.touch_public_request_link();
