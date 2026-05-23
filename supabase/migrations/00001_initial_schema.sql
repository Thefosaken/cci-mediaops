-- CCI MediaOps - Initial Schema
-- This migration creates the core database tables as defined in the PRD.

-- 0. Extensions
create extension if not exists "pgcrypto";

-- 1. Organizations
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Campuses
create table if not exists campuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  location text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Users
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  full_name text not null,
  email text not null unique,
  phone text,
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Roles
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  scope text not null default 'campus' check (scope in ('global', 'campus', 'sub_team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Permissions
create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text
);

-- 6. Role Permissions
create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade
);

-- 7. Campus Memberships
create table if not exists campus_memberships (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 8. Sub-Teams
create table if not exists sub_teams (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 9. Sub-Team Memberships
create table if not exists sub_team_memberships (
  id uuid primary key default gen_random_uuid(),
  sub_team_id uuid not null references sub_teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete restrict,
  status text not null default 'active' check (status in ('pending', 'active', 'inactive', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sub_team_id, user_id)
);

-- 10. Events
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses(id) on delete cascade,
  title text not null,
  event_type text not null,
  description text,
  location text,
  start_time timestamptz not null,
  end_time timestamptz,
  status text not null default 'draft' check (status in ('draft', 'planning', 'confirmed', 'live', 'completed', 'cancelled')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 11. Event Sub-Teams
create table if not exists event_sub_teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  sub_team_id uuid not null references sub_teams(id) on delete cascade,
  unique(event_id, sub_team_id)
);

-- 12. Schedule Slots
create table if not exists schedule_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  sub_team_id uuid not null references sub_teams(id) on delete cascade,
  role_title text not null,
  assigned_user_id uuid references users(id) on delete set null,
  call_time timestamptz,
  start_time timestamptz,
  end_time timestamptz,
  confirmation_status text not null default 'pending' check (confirmation_status in ('pending', 'confirmed', 'declined', 'replacement_needed')),
  attendance_status text check (attendance_status in ('present', 'absent', 'late', 'excused')),
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 13. Requests
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses(id) on delete cascade,
  event_id uuid references events(id) on delete set null,
  title text not null,
  requesting_unit text not null,
  requester_id uuid not null references users(id) on delete cascade,
  description text,
  desired_output text,
  deadline timestamptz,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'clarification_needed', 'accepted', 'in_progress', 'awaiting_approval', 'changes_requested', 'completed', 'rejected', 'cancelled')),
  approval_required boolean not null default false,
  approver_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 14. Request Sub-Teams
create table if not exists request_sub_teams (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  sub_team_id uuid not null references sub_teams(id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'clarification_needed', 'accepted', 'in_progress', 'awaiting_approval', 'changes_requested', 'completed', 'rejected', 'cancelled')),
  unique(request_id, sub_team_id)
);

-- 15. Tasks
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses(id) on delete cascade,
  event_id uuid references events(id) on delete set null,
  request_id uuid references requests(id) on delete set null,
  sub_team_id uuid not null references sub_teams(id) on delete cascade,
  title text not null,
  description text,
  assigned_user_id uuid references users(id) on delete set null,
  due_date timestamptz,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'to_do' check (status in ('to_do', 'in_progress', 'blocked', 'awaiting_review', 'changes_requested', 'completed', 'cancelled')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 16. Run Sheets
create table if not exists run_sheets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'live', 'completed')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 17. Run Sheet Segments
create table if not exists run_sheet_segments (
  id uuid primary key default gen_random_uuid(),
  run_sheet_id uuid not null references run_sheets(id) on delete cascade,
  sequence_order integer not null default 0,
  title text not null,
  segment_type text not null,
  planned_start_time timestamptz,
  estimated_duration_minutes integer,
  owner_name text,
  projection_cue text,
  sound_cue text,
  lighting_cue text,
  camera_cue text,
  social_media_cue text,
  notes text,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 18. Equipment Items
create table if not exists equipment_items (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses(id) on delete cascade,
  sub_team_id uuid not null references sub_teams(id) on delete cascade,
  name text not null,
  category text,
  asset_tag text,
  serial_number text,
  description text,
  condition_status text not null default 'good' check (condition_status in ('good', 'fair', 'faulty', 'missing', 'under_repair')),
  availability_status text not null default 'available' check (availability_status in ('available', 'assigned', 'checked_out', 'checked_in', 'unavailable')),
  storage_location text,
  current_custodian_id uuid references users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 19. Equipment Assignments
create table if not exists equipment_assignments (
  id uuid primary key default gen_random_uuid(),
  equipment_item_id uuid not null references equipment_items(id) on delete cascade,
  event_id uuid references events(id) on delete set null,
  assigned_to_user_id uuid references users(id) on delete set null,
  status text not null default 'assigned' check (status in ('assigned', 'checked_out', 'checked_in', 'unavailable')),
  checkout_time timestamptz,
  checkin_time timestamptz,
  checkout_condition text,
  checkin_condition text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 20. Approvals
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  submitted_by uuid not null references users(id) on delete cascade,
  approver_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('not_required', 'pending', 'approved', 'changes_requested', 'rejected')),
  submitted_link text,
  feedback text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 21. Notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  entity_type text not null check (entity_type in ('request', 'task', 'equipment', 'incident', 'event')),
  entity_id uuid not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- 22. Incidents
create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses(id) on delete cascade,
  event_id uuid references events(id) on delete set null,
  sub_team_id uuid references sub_teams(id) on delete set null,
  reported_by uuid not null references users(id) on delete cascade,
  incident_type text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  description text,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved')),
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 23. Comments
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('request', 'task', 'equipment', 'incident', 'event')),
  entity_id uuid not null,
  user_id uuid not null references users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- 24. Attachment Links
create table if not exists attachment_links (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('request', 'task', 'equipment', 'incident', 'event')),
  entity_id uuid not null,
  title text,
  url text not null,
  file_type text,
  added_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 25. Audit Logs
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_campus_memberships_user on campus_memberships(user_id);
create index idx_campus_memberships_campus on campus_memberships(campus_id);
create index idx_sub_team_memberships_user on sub_team_memberships(user_id);
create index idx_sub_team_memberships_team on sub_team_memberships(sub_team_id);
create index idx_events_campus on events(campus_id);
create index idx_events_start on events(start_time);
create index idx_schedule_slots_event on schedule_slots(event_id);
create index idx_schedule_slots_user on schedule_slots(assigned_user_id);
create index idx_requests_campus on requests(campus_id);
create index idx_requests_requester on requests(requester_id);
create index idx_requests_status on requests(status);
create index idx_tasks_assigned on tasks(assigned_user_id);
create index idx_tasks_sub_team on tasks(sub_team_id);
create index idx_tasks_status on tasks(status);
create index idx_equipment_sub_team on equipment_items(sub_team_id);
create index idx_equipment_condition on equipment_items(condition_status);
create index idx_notifications_user on notifications(user_id);
create index idx_notifications_unread on notifications(user_id, read_at);
create index idx_approvals_approver on approvals(approver_id);
create index idx_approvals_status on approvals(status);
create index idx_incidents_status on incidents(status);
create index idx_comments_entity on comments(entity_type, entity_id);
create index idx_audit_logs_entity on audit_logs(entity_type, entity_id);

-- Enable Row Level Security
alter table organizations enable row level security;
alter table campuses enable row level security;
alter table users enable row level security;
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table campus_memberships enable row level security;
alter table sub_teams enable row level security;
alter table sub_team_memberships enable row level security;
alter table events enable row level security;
alter table event_sub_teams enable row level security;
alter table schedule_slots enable row level security;
alter table requests enable row level security;
alter table request_sub_teams enable row level security;
alter table tasks enable row level security;
alter table run_sheets enable row level security;
alter table run_sheet_segments enable row level security;
alter table equipment_items enable row level security;
alter table equipment_assignments enable row level security;
alter table approvals enable row level security;
alter table notifications enable row level security;
alter table incidents enable row level security;
alter table comments enable row level security;
alter table attachment_links enable row level security;
alter table audit_logs enable row level security;

-- Seed default roles
insert into roles (name, description, scope) values
  ('super_admin', 'System owner with full access', 'global'),
  ('media_admin', 'Media operations leader for campus', 'campus'),
  ('sub_team_lead', 'Leads a specific media sub-team', 'sub_team'),
  ('assistant_lead', 'Supports the sub-team lead', 'sub_team'),
  ('team_member', 'Serving member of the media team', 'sub_team'),
  ('requester', 'Member of another church unit requesting media support', 'campus'),
  ('approver', 'Reviews and approves content/output', 'campus')
on conflict (name) do nothing;

-- Seed default sub-teams (will need a campus_id, so this is informational)
-- The application should create these when setting up a campus:
-- Projection, Videography, Photography, Design, Lighting, Sound, Social Media
