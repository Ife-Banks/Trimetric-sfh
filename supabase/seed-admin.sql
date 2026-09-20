-- ============================================================================
-- seed-admin.sql — bootstrap the root superadmin account
-- Run AFTER you have created the auth account you will log in with for
-- admin review (Supabase Dashboard → Authentication → Users → Add user).
-- The profile PK is a FK to auth.users(id), so this cannot run before that
-- user exists. The on_auth_user_created trigger will have already created a
-- 'user' profile row, so this upserts (UPDATE, not skip) to elevate it.
--
-- Why superadmin: superadmins create admin accounts (email+password) from
-- the app at /admin/admins. A single reviewer should be the root.
--
-- HOW TO USE:
--   1. Copy the target user's UUID from Dashboard → Authentication → Users.
--   2. Replace '<REPLACE_WITH_SUPERADMIN_USER_UUID>' below.
--   3. Paste into Dashboard → SQL Editor → Run.
--
-- Idempotent: re-running is a no-op (target is already superadmin).
-- ============================================================================

insert into profiles (id, role)
values ('<REPLACE_WITH_SUPERADMIN_USER_UUID>', 'superadmin')
on conflict (id) do update set role = 'superadmin';