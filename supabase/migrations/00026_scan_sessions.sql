-- ═══════════════════════════════════════════════════════════════════════════
--  00026 · Scan Sessions — MIGRATION  (COMMITS — permanent)
--  Suggested SQL Editor tab name:  00026 Scan Sessions
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Desktop-to-phone handoff for scanning an equipment serial number. Reading a
-- tiny serial label with a laptop webcam is miserable; a phone camera is not.
--
-- ── The flow ─────────────────────────────────────────────────────────────
--   1. Desktop "Scan" creates a session (random token) and shows a QR code.
--   2. The phone opens /scan/<token> — a public, no-login page — reads the
--      serial on-device (Tesseract, the image never leaves the phone), and
--      writes back only the text.
--   3. The desktop is subscribed to this row over Realtime and fills the field
--      the moment `result` lands, then the session is done.
--
-- ── Why a token, and who writes ──────────────────────────────────────────
-- The phone is not signed in, so /scan/<token> reads and writes through the
-- service-role client — the token is the whole gate. Sessions expire in 15
-- minutes so a stale QR is worthless. Signed-in users get permissive SELECT so
-- the desktop can read + subscribe; no anon insert/update policy exists because
-- the phone's write goes through service-role (which bypasses RLS).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists scan_sessions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  result text,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create index if not exists idx_scan_sessions_token on scan_sessions (token);

alter table scan_sessions enable row level security;

create policy "scan_sessions_select" on scan_sessions
  for select to authenticated using (true);
create policy "scan_sessions_insert" on scan_sessions
  for insert to authenticated with check (true);

-- Stream row changes to subscribed clients (desktop picks up the phone's write).
alter publication supabase_realtime add table scan_sessions;

-- Confirm.
select 'scan_sessions' as table,
       (select count(*) from pg_policies where tablename = 'scan_sessions') as policies,
       (select count(*) from pg_publication_tables
         where pubname = 'supabase_realtime' and tablename = 'scan_sessions') as in_realtime;
