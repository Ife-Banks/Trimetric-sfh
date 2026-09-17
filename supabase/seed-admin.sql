-- ============================================================================
-- seed-admin.sql — grant the admin role to an auth user
-- Run AFTER you have created the auth account you will log in with for
-- admin review (Supabase Dashboard → Authentication → Users → Add user,
-- or sign up through the app). The profile PK is a FK to auth.users(id), so
-- this cannot run before that user exists.
--
-- HOW TO USE:
--   1. Copy the target user's UUID from Dashboard → Authentication → Users.
--   2. Replace '<REPLACE_WITH_ADMIN_USER_UUID>' below.
--   3. Paste into Dashboard → SQL Editor → Run.
--
-- Idempotent: re-running does nothing (on conflict do nothing).
-- ============================================================================

insert into profiles (id, role)
values ('<REPLACE_WITH_ADMIN_USER_UUID>', 'admin')
on conflict (id) do nothing;