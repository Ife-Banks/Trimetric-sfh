-- Phase 7 hardening - closes the anonymous-write bypass and fixes data-layer
-- defects found in the pre-launch review (05_SECURITY_ASSESSMENT.md).
--
-- HOW TO APPLY
--   Supabase Dashboard -> your project -> SQL Editor -> New query, paste this
--   whole file, Run. Every statement is idempotent, so it is safe to re-run.
--   Read the verification table at the bottom before trusting it.
--
-- ATOMICITY
--   Wrapped in an explicit transaction on purpose. Without one, a failure at
--   statement 3 would leave statements 1-2 committed - i.e. the anonymous-write
--   bypass partially closed and the constraints partially applied, which is
--   harder to reason about than not having run it at all. Either the whole file
--   lands or none of it does.
--
begin;

-- ---------------------------------------------------------------------------
-- 1. submissions INSERT hardened at the database layer
-- ---------------------------------------------------------------------------
-- The anon key ships in the client bundle, and `submissions_insert_anyone`
-- permitted ANY role to INSERT with status='pending'. That made every control
-- in /api/submissions (Zod validation, per-IP rate limit, fingerprint pending
-- cap) purely advisory: a direct
--   POST /rest/v1/submissions  -H "apikey: $ANON_KEY"
-- inserted an arbitrary row with no validation, no rate limit, no length cap
-- and no fingerprint cap. SEC-04's central threat (review-queue flooding) was
-- fully open.
--
-- The route is not a trust boundary - it is one caller among many. The
-- constraint has to live where the write actually lands: in the policy. RLS
-- WITH CHECK runs for EVERY writer, including direct PostgREST, and it can
-- only ever make the insert harder.
--
-- Enforced here (application-level rate limiting still belongs in the route;
-- it cannot be expressed in RLS):
--   * the row must claim the anonymous/pending shape the app writes
--   * reviewed_* must be empty - a submitter cannot pre-stamp a review
--   * a signed-in submitter must be the caller; an anon submitter is NULL
--   * lengths bounded to the same ceilings the Zod schema enforces

-- `create policy` has no IF NOT EXISTS in Postgres. Drop BOTH the legacy name
-- and this policy's own name, so the file is safe to re-run regardless of
-- whether a previous attempt got part of the way through.
-- (Without the second drop, a re-run fails with
--  42710: policy "submissions_insert_anon" for table "submissions" already exists)
drop policy if exists submissions_insert_anyone on public.submissions;
drop policy if exists submissions_insert_anon  on public.submissions;

create policy submissions_insert_anon
  on public.submissions
  for insert
  to anon, authenticated
  with check (
    -- Only genuinely unreviewed rows may enter the queue.
    status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and review_note is null

    -- A submitter may only file under their own identity. Without this, an
    -- attacker could write rows carrying a victim's uuid, and
    -- `submissions_read_own` would then surface those rows in that victim's
    -- /history. auth.uid() is NULL for anon, so the anonymous case is the
    -- NULL branch.
    and (submitted_by is null or submitted_by = auth.uid())

    -- Same ceilings as submissionPayloadSchema. These columns are unconstrained
    -- `text` at the table level, so without this an unbounded body could be
    -- written directly.
    and char_length(product_name) between 1 and 200
    and char_length(coalesce(brand, '')) <= 200
    and char_length(ingredients_text) between 1 and 12000
    and char_length(coalesce(certification_text, '')) <= 200
    and char_length(coalesce(concentration_text, '')) <= 200
    and (barcode is null or barcode ~ '^[0-9]{8,14}$')
    and (category = 'gmo_food' or category = 'oral_care')
    and (gmo_status is null or gmo_status in ('non_gmo_certified', 'contains_gmo', 'not_sure'))

    -- Every real submission carries a photo path (submissionPayloadSchema
    -- requires it), and /api/admin/approve refuses to approve a row without one.
    -- Requiring it here stops the queue being filled with rows that are
    -- un-approvable by construction - pure reviewer noise, never resolvable.
    and photo_path is not null
    and photo_path ~* '^pending/[a-z0-9-]+\.(jpg|jpeg|png)$'

    -- The fingerprint is the pending-cap key. A NULL or malformed one would be
    -- invisible to count_pending_submissions(), so allowing it lets a submitter
    -- sidestep the cap entirely.
    and submitter_fingerprint is not null
    and char_length(submitter_fingerprint) between 8 and 120
  );

-- ---------------------------------------------------------------------------
-- 2. front_photo_path accepted .png shapes the column rejected
-- ---------------------------------------------------------------------------
-- photoPathPattern in src/lib/validation/schemas.ts accepts
-- `^pending\/[a-z0-9-]+\.(jpe?g|png)$` and the storage bucket allows
-- image/png, but the column CHECK allowed only `\.jpe?g$`. A hand-crafted
-- submission with "pending/abc.png" therefore passed Zod and the storage
-- policy, then violated the CHECK - surfacing as a 500 whose body disclosed
-- the constraint name to an anonymous caller.
--
-- Also: the regex was case-SENSITIVE (`~`) where Zod is case-INSENSITIVE
-- (`/i`), a latent mismatch masked today only because
-- crypto.randomUUID() happens to emit lowercase hex.
--
-- And photo_path - the column approve() actually gates on, and the more
-- security-relevant of the two - had NO check at all. A direct insert could
-- set it to anything. Both are constrained identically now.

alter table public.submissions
  drop constraint if exists submissions_front_photo_path_check;

alter table public.submissions
  add constraint submissions_front_photo_path_check
  check (
    front_photo_path is null
    or front_photo_path ~* '^pending/[a-z0-9-]+\.(jpg|jpeg|png)$'
  );

-- Also dropped first, so this file is re-runnable.
alter table public.submissions
  drop constraint if exists submissions_photo_path_check;

alter table public.submissions
  add constraint submissions_photo_path_check
  check (
    photo_path is null
    or photo_path ~* '^pending/[a-z0-9-]+\.(jpg|jpeg|png)$'
  );

-- ---------------------------------------------------------------------------
-- 3. products.updated_at was never maintained
-- ---------------------------------------------------------------------------
-- `updated_at timestamptz not null default now()` with no trigger. Every admin
-- correction to a product left a stale timestamp, so "which verified products
-- were recently corrected" - the audit signal SEC-07 relies on - could not be
-- answered.

create or replace function public.touch_products_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_touch_updated_at on public.products;

create trigger products_touch_updated_at
  before update on public.products
  for each row
  execute function public.touch_products_updated_at();

-- ---------------------------------------------------------------------------
-- 4. approve_submission() was still executable by anon
-- ---------------------------------------------------------------------------
-- `revoke execute ... from anon` was a no-op: Postgres grants EXECUTE to
-- PUBLIC on new functions, and `anon` holds its rights through PUBLIC rather
-- than through a direct grant, so revoking from `anon` removed nothing. The
-- correct form is `from public`. Not exploitable (the function raises
-- 'not authorized' first), but it is the literal SEC-10 requirement and was
-- not actually met.

revoke execute on function public.approve_submission(uuid, jsonb) from public;

-- ---------------------------------------------------------------------------
-- 5. Storage bucket definition never reconciled
-- ---------------------------------------------------------------------------
-- `on conflict (id) do nothing` means re-running could never correct a bucket
-- that was created out-of-band as public, with a larger size limit, or with a
-- broader MIME list. Now the security-relevant flags are actively enforced.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submission-images', 'submission-images', false, 5242880,
        array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 6. Superadmin role bootstrap is now re-run safe
-- ---------------------------------------------------------------------------
-- The original was an unconditional `update profiles set role = 'superadmin'
-- where role = 'admin'`, so deliberately demoting a superadmin back to 'admin'
-- was silently undone by any re-apply of that file. Only bootstrap when no
-- superadmin exists at all.

do $$
begin
  if not exists (select 1 from public.profiles where role = 'superadmin') then
    update public.profiles set role = 'superadmin' where role = 'admin';
  end if;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- Verification - read the results table before trusting this run
-- ---------------------------------------------------------------------------
-- Every statement above is idempotent, so this file is safe to re-run. What is
-- NOT safe is assuming it landed: if the SQL editor reported an error partway
-- through, the whole transaction rolled back and nothing changed.
--
-- Expect ONE row per check with present = true.
select 'RLS enabled on submissions' as check_name,
       (select relrowsecurity from pg_class where oid = 'public.submissions'::regclass) as present
union all
select 'policy submissions_insert_anon (hardened)',
       exists (select 1 from pg_policies
                where schemaname = 'public'
                  and tablename = 'submissions'
                  and policyname = 'submissions_insert_anon')
union all
select 'legacy policy submissions_insert_anyone removed',
       not exists (select 1 from pg_policies
                    where schemaname = 'public'
                      and tablename = 'submissions'
                      and policyname = 'submissions_insert_anyone')
union all
select 'photo_path CHECK constrains path shape',
       exists (select 1 from pg_constraint
                where conname = 'submissions_photo_path_check')
union all
select 'front_photo_path CHECK constrains path shape',
       exists (select 1 from pg_constraint
                where conname = 'submissions_front_photo_path_check')
union all
select 'products updated_at trigger',
       exists (select 1 from pg_trigger where tgname = 'products_touch_updated_at')
union all
select 'approve_submission revoked from public',
       not has_function_privilege('anon', 'public.approve_submission(uuid, jsonb)', 'execute')
union all
select 'submission bucket is private and size-capped',
       exists (select 1 from storage.buckets
                where id = 'submission-images' and public = false and file_size_limit = 5242880)
order by check_name;
