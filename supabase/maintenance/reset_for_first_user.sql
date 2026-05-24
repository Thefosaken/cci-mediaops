-- CCI MediaOps — RESET TO BLANK SLATE
--
-- ⚠️  THIS IS DESTRUCTIVE. Run only when you intend to wipe every user,
--     every campus, every event, request, schedule, run sheet, equipment
--     item, incident, comment, attachment, notification, and join request,
--     so the next person to sign up is auto-promoted to super_admin and
--     the system bootstraps from zero.
--
-- It does NOT drop tables, change schema, or remove roles/permissions.
-- The auth user list is also cleared so the first sign-up triggers the
-- bootstrap path again.

begin;

-- 1. Application data (in FK-safe order; many already cascade)
delete from public.notifications;
delete from public.comments;
delete from public.attachment_links;
delete from public.audit_logs;
delete from public.approvals;
delete from public.sub_team_join_requests;

delete from public.run_sheet_segments;
delete from public.run_sheets;

delete from public.schedule_slots;
delete from public.equipment_assignments;
delete from public.equipment_items;
delete from public.incidents;

delete from public.tasks;
delete from public.request_sub_teams;
delete from public.requests;

delete from public.event_sub_teams;
delete from public.events;

-- 2. Sub-teams + memberships
delete from public.sub_team_memberships;
delete from public.sub_teams;

-- 3. Campus + org structure
delete from public.campus_memberships;
delete from public.campuses;
delete from public.organizations;

-- 4. Users (public + auth)
delete from public.users;
delete from auth.users;

commit;

-- Sanity: every count should be 0
select 'auth.users' as table_name, count(*)::int from auth.users
union all select 'public.users', count(*)::int from public.users
union all select 'campuses', count(*)::int from public.campuses
union all select 'organizations', count(*)::int from public.organizations
union all select 'sub_teams', count(*)::int from public.sub_teams
union all select 'campus_memberships', count(*)::int from public.campus_memberships
union all select 'sub_team_join_requests', count(*)::int from public.sub_team_join_requests
union all select 'events', count(*)::int from public.events
union all select 'requests', count(*)::int from public.requests
union all select 'notifications', count(*)::int from public.notifications;
