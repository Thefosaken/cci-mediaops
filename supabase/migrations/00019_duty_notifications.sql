-- ═══════════════════════════════════════════════════════════════════════════
--  00019 · Duty Notifications — MIGRATION  (COMMITS — changes are permanent)
--  Suggested SQL Editor tab name:  00019 Duty Notifications
-- ═══════════════════════════════════════════════════════════════════════════
--
-- notifications.entity_type is constrained to request / task / equipment / incident /
-- event, so a notification cannot currently point at a duty. Being rostered is exactly
-- the kind of thing someone needs telling about, so the constraint is widened.
--
-- Adding rather than replacing: every existing value stays valid.

alter table notifications drop constraint if exists notifications_entity_type_check;

alter table notifications
  add constraint notifications_entity_type_check
  check (entity_type in ('request', 'task', 'equipment', 'incident', 'event', 'duty'));

-- ── Confirm ──────────────────────────────────────────────────────────────
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conname = 'notifications_entity_type_check';
