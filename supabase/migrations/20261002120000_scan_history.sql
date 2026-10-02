-- Scan history — the third table.
--
-- WHY IT EXISTS
--   There was no scan log. `products` is the verified catalogue and
--   `submissions` records proposed corrections, so the dashboard's "Recent
--   Checks" had nothing truthful to read and fell back to the device-local
--   store (lib/savedScans) — which only ever contains scans the user explicitly
--   chose to keep, only on the device where they kept them. A user scanning on
--   two devices saw two different, incomplete histories, and a scan they did
--   not "Save to My History" was invisible immediately after they took it.
--
-- WHY IT IS THIN
--   This is a receipt, not a second copy of the verdict. It stores what the feed
--   renders and what the row needs to be traced back to the catalogue. It
--   deliberately does NOT store the captured image: those are full-resolution
--   blobs, Storage already holds the ones that matter (submissions), and the
--   feed's thumbnail is the on-device data URL that exists only for that device.
--   It also does not store the OCR text or the matched terms; the verdict is
--   reproducible from `products` + the published ruleset version.
--
-- ANONYMOUS SCANS ARE NOT LOGGED
--   `scanned_by` is the RLS key. An unowned row would have to be either
--   world-readable (a privacy problem) or readable by nobody (pointless), so the
--   app's answer is that guests keep their on-device store. The insert policy
--   enforces this rather than trusting the client to skip the call.
--
-- HOW TO APPLY
--   Supabase Dashboard -> your project -> SQL Editor -> New query, paste this
--   whole file, Run. Idempotent and transactional, like the other migrations.
--
-- Expect one row per check with present = true.

begin;

create table if not exists public.scans (
  id              uuid primary key default gen_random_uuid(),

  -- The owner. ON DELETE CASCADE: a deleted account's scan receipts are not
  -- something the app has any reason to keep, and an orphaned row would be
  -- unreachable under the read policy below (scanned_by = auth.uid() can never
  -- match a deleted user).
  scanned_by      uuid not null references auth.users(id) on delete cascade,

  -- SET NULL, not CASCADE: a scan receipt should survive the catalogue row being
  -- withdrawn. The receipt is a record of what the user was shown, and that
  -- stays true even if the product is later removed or re-verified.
  product_id      uuid references public.products(id) on delete set null,

  category        product_category not null,

  -- Nullable, and that is the honest shape: a cold scan that matched nothing has
  -- no product name to record. The feed renders "Unidentified product" rather
  -- than inventing one.
  product_name    text,
  brand           text,

  result_tier     verdict_tier not null,
  result_label    text not null,
  confidence_tier verdict_tier not null,
  identity_match  text not null check (identity_match in ('barcode', 'name', 'none')),

  -- The number the result gauge displayed (fluid ppm / crop-derived term count).
  -- Null when the engine produced no honest number.
  metric          text,

  created_at      timestamptz not null default now(),

  -- Same ceilings the client writes against, enforced where the write lands.
  constraint scans_product_name_len check (product_name is null or char_length(product_name) between 1 and 200),
  constraint scans_brand_len        check (brand is null or char_length(brand) <= 200),
  constraint scans_metric_len       check (metric is null or char_length(metric) <= 120),
  constraint scans_result_label_len check (char_length(result_label) between 1 and 200)
);

-- The feed's only query shape: this user's most recent scans.
create index if not exists scans_scanned_by_created_at_idx
  on public.scans (scanned_by, created_at desc);

alter table public.scans enable row level security;

-- Read your own receipts. No admin policy: this is personal activity, not
-- review material, and nothing in the app needs to read another user's scans.
drop policy if exists scans_read_own on public.scans;
create policy scans_read_own
  on public.scans
  for select
  to authenticated
  using (scanned_by = auth.uid());

-- Insert only as yourself. There is no UPDATE or DELETE policy: a receipt is
-- append-only from the client's side, so a compromised client cannot rewrite
-- history or erase the evidence of a scan.
drop policy if exists scans_insert_own on public.scans;
create policy scans_insert_own
  on public.scans
  for insert
  to authenticated
  -- Parenthesised on purpose. AND binds tighter than OR, so an unparenthesised
  -- `scanned_by = auth.uid() and category = 'gmo_food' or category = 'oral_care'`
  -- parses as
  --   (scanned_by = auth.uid() and category = 'gmo_food') or category = 'oral_care'
  -- which lets ANY signed-in user insert oral_care rows attributed to anyone.
  with check (
    scanned_by = auth.uid()
    and (category = 'gmo_food' or category = 'oral_care')
  );

commit;

-- Verification — expect ONE row per check with present = true.
select 'scans table exists' as check_name,
       exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = 'scans') as present
union all
select 'RLS enabled on scans',
       (select relrowsecurity from pg_class where oid = 'public.scans'::regclass)
union all
select 'policy scans_read_own is scoped to the owner',
       exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'scans'
                  and policyname = 'scans_read_own'
                  and qual like '%scanned_by = auth.uid()%')
union all
select 'policy scans_insert_own is scoped to the owner',
       exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'scans'
                  and policyname = 'scans_insert_own'
                  and with_check like '%scanned_by = auth.uid()%')
union all
select 'append-only (no update or delete policy)',
       not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = 'scans'
                      and cmd in ('UPDATE', 'DELETE'))
union all
select 'feed index on (scanned_by, created_at desc)',
       exists (select 1 from pg_indexes
                where schemaname = 'public' and tablename = 'scans'
                  and indexname = 'scans_scanned_by_created_at_idx')
order by check_name;
