-- ═══════════════════════════════════════════════════════════════════════════
--  00020 · Request Attachments — MIGRATION  (COMMITS — changes are permanent)
--  Suggested SQL Editor tab name:  00020 Request Attachments
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Files and media hung off a request: the brief someone was handed, the photo of
-- the broken cable, the deck the design has to match. Until now the only way to
-- pass one along was to paste a Drive link into the description.
--
-- Two things are being created here — a table of attachment *records* and a
-- Storage bucket holding the actual bytes. They are deliberately separate:
-- the bucket is the only place bytes live, and the row is the only place we
-- record who attached what and to which request. Deleting a request cascades
-- the rows; the objects are removed by the server action, not by the database
-- (Postgres cannot reach into Storage).
--
-- The bucket is PRIVATE. Nothing here is world-readable by URL — the app hands
-- out short-lived signed URLs. See §4 for why the public request form still
-- works without an anon write policy.

-- ── 1. request_attachments ───────────────────────────────────────────────

create table if not exists request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,

  -- Object key inside the `request-attachments` bucket. Always '{request_id}/{uuid}-{name}'.
  storage_path text not null,
  -- The name the uploader saw. Kept separate from storage_path because the path
  -- is de-duplicated and sanitised, and "Brief FINAL v3.pdf" is what they expect
  -- to download.
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),

  -- Null for public submissions: an outsider filing through a shared link has
  -- no users row and never will. Set null (not cascade) on user deletion so the
  -- file survives the person leaving.
  uploaded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One object, one row. Re-running a recording call must not duplicate.
create unique index if not exists idx_request_attachments_path
  on request_attachments (storage_path);
create index if not exists idx_request_attachments_request
  on request_attachments (request_id, created_at);

-- ── 2. RLS on request_attachments ────────────────────────────────────────
-- Permissive, matching the project-wide pattern in CLAUDE.md: reads are open to
-- authenticated users and role enforcement lives in server actions. There is no
-- anon policy — public submissions are written by the service-role client after
-- the link token has been checked, and service-role bypasses RLS.

alter table request_attachments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'request_attachments' and policyname = 'Authenticated read request_attachments') then
    create policy "Authenticated read request_attachments" on request_attachments for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'request_attachments' and policyname = 'Authenticated insert request_attachments') then
    create policy "Authenticated insert request_attachments" on request_attachments for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'request_attachments' and policyname = 'Authenticated delete request_attachments') then
    create policy "Authenticated delete request_attachments" on request_attachments for delete to authenticated using (true);
  end if;
end;
$$;

-- ── 3. Storage bucket ────────────────────────────────────────────────────
-- `file_size_limit` and `allowed_mime_types` are enforced by Storage itself, on
-- every upload, including signed-URL uploads. That matters more than usual here:
-- the public request form is unauthenticated, so this row is the last line that
-- cannot be talked out of by a crafted client.
--
-- 10 MB, matching MAX_ATTACHMENT_BYTES in src/lib/attachments/index.ts. If you
-- change one, change the other.
--
-- image/svg+xml is deliberately absent. An SVG is a script-bearing document, and
-- these files are served back to staff from our own origin.
--
-- `on conflict do update` rather than `do nothing` so re-running this script
-- repairs limits that were changed by hand in the dashboard.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'request-attachments',
  'request-attachments',
  false,
  10485760,
  array[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 4. Storage RLS ───────────────────────────────────────────────────────
-- Signed-in staff get full access to this bucket and nothing else.
--
-- There is intentionally NO policy for `anon`. A public submitter never talks to
-- Storage with the anon key — the server action validates the link token and
-- mints a one-shot signed upload URL with the service-role key, which bypasses
-- RLS. Granting anon insert here would turn the bucket into an open drop box for
-- anyone who can read our publishable key, which is every visitor.
--
-- storage.objects is owned by supabase_storage_admin. In the SQL Editor you are
-- `postgres`, which normally has rights to add policies to it — but on some
-- projects it does not. If this block raises, the notice tells you what to do by
-- hand; the rest of the migration has already committed.

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated read request attachments') then
    create policy "Authenticated read request attachments" on storage.objects
      for select to authenticated using (bucket_id = 'request-attachments');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated upload request attachments') then
    create policy "Authenticated upload request attachments" on storage.objects
      for insert to authenticated with check (bucket_id = 'request-attachments');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated update request attachments') then
    create policy "Authenticated update request attachments" on storage.objects
      for update to authenticated using (bucket_id = 'request-attachments') with check (bucket_id = 'request-attachments');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated delete request attachments') then
    create policy "Authenticated delete request attachments" on storage.objects
      for delete to authenticated using (bucket_id = 'request-attachments');
  end if;
exception
  when insufficient_privilege then
    raise notice 'Could not create storage.objects policies as this role. Create them by hand: Dashboard -> Storage -> request-attachments -> Policies, granting SELECT/INSERT/UPDATE/DELETE to the authenticated role for this bucket.';
end;
$$;

-- ── Confirm ──────────────────────────────────────────────────────────────
select
  (select count(*) from request_attachments)                                   as attachment_rows,
  (select count(*) from storage.buckets where id = 'request-attachments')      as bucket_exists,
  (select file_size_limit from storage.buckets where id = 'request-attachments') as size_limit,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like '%request attachments')                              as storage_policies;
