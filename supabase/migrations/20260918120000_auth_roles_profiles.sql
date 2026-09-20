-- ============================================================================
-- Auth: superadmin role, auto-created profiles, per-user submission history
--
-- Introduces the three-role model:
--   superadmin  — root. Can create admin accounts (email+password) via the API.
--   admin       — reviewer. Approves/rejects submissions; writes products.
--   user        — normal account (currently always Google sign-up). Sees own
--                 submission history. Anonymous scanning needs no account.
--
-- Bootstrap: any existing 'admin' profile is promoted to 'superadmin' so a
-- project that already has its single reviewer keeps a root account. If you
-- have multiple independent admins, promote selectively instead:
--   update profiles set role = 'superadmin' where ...;
--
-- Also adds an on_auth_user_created trigger so every new auth user gets a
-- profiles row. Without it, Google-registered users would have no role.
-- ============================================================================

-- 1) Extend the roles constraint.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('user', 'admin', 'superadmin'));

-- 2) Bootstrap root account(s).
update profiles set role = 'superadmin' where role = 'admin';

-- 3) is_admin() now admits both admin and superadmin (superadmin is a strict
--    superset: it can do everything an admin can).
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'superadmin')
  );
$$;

-- 4) Superadmin-only check (create-admin accounts, nothing else).
create or replace function is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

-- 5) Every new auth user automatically gets a 'user' profile row. Runs for
--    both OAuth (Google) and admin-API signups. Admins created by a
--    superadmin are elevated afterwards +their id+.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, role)
  values (new.id, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 6) Users may read their own submissions (history). Admins still read all via
--    submissions_read_admin; permissive RLS policies OR together.
create policy submissions_read_own on submissions
  for select using (submitted_by = auth.uid());