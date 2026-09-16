create extension if not exists pg_trgm;

create type product_category as enum ('gmo_food', 'oral_care');
create type verdict_tier     as enum ('none', 'low', 'medium', 'high');
create type submission_status as enum ('pending', 'approved', 'rejected');

create table submissions (
  id                  uuid primary key default gen_random_uuid(),
  category            product_category not null,
  subcategory         text,
  product_name        text not null,
  brand               text,
  barcode             text,
  ingredients_text    text not null,
  certification_text  text,                 -- GMO path
  concentration_text  text,                 -- fluoride path
  photo_path          text,                 -- Storage object path, not a public URL
  ocr_confidence      numeric(3,2),
  engine_preview      jsonb,                -- EngineResult at submission time
  status              submission_status not null default 'pending',
  submitted_by        uuid references auth.users(id),  -- nullable: anonymous allowed
  submitter_fingerprint text,               -- coarse rate-limit key, not PII
  reviewed_by         uuid references auth.users(id),
  reviewed_at         timestamptz,
  review_note         text,
  created_at          timestamptz not null default now()
);

create index submissions_status_idx  on submissions (status, created_at desc);
create index submissions_category_idx on submissions (category);

create table products (
  id                  uuid primary key default gen_random_uuid(),
  barcode             text unique,
  name                text not null,
  brand               text,
  category            product_category not null,
  subcategory         text not null,
  ingredients_text    text not null,
  result_tier         verdict_tier not null,
  result_label        text not null,
  confidence_tier     verdict_tier not null,
  matched_terms       jsonb not null default '[]'::jsonb,
  guidance_text       text,
  target_audience_notes text,              -- admin-curated only, never computed
  config_version      text not null,        -- which ruleset produced this
  source_submission_id uuid references submissions(id),
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index products_barcode_idx  on products (barcode);
create index products_category_idx on products (category);
create index products_name_trgm    on products using gin (name gin_trgm_ops);

create table lookup_config (
  id            uuid primary key default gen_random_uuid(),
  category      product_category not null,
  version       text not null,
  config_json   jsonb not null,
  is_published  boolean not null default false,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (category, version)
);

create unique index one_published_per_category
  on lookup_config (category) where is_published;

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

alter table products      enable row level security;
alter table submissions   enable row level security;
alter table lookup_config enable row level security;
alter table profiles      enable row level security;

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- products: world-readable, admin-writable
create policy products_read_all on products
  for select using (true);

create policy products_write_admin on products
  for all using (is_admin()) with check (is_admin());

-- submissions: anyone may propose; only admins may read or moderate
create policy submissions_insert_anyone on submissions
  for insert with check (status = 'pending');

create policy submissions_read_admin on submissions
  for select using (is_admin());

create policy submissions_update_admin on submissions
  for update using (is_admin()) with check (is_admin());

-- lookup_config: published rows readable by all, admin-writable
create policy config_read_published on lookup_config
  for select using (is_published = true or is_admin());

create policy config_write_admin on lookup_config
  for all using (is_admin()) with check (is_admin());

-- profiles: users read their own; admins read all
create policy profiles_read_own on profiles
  for select using (id = auth.uid() or is_admin());

create or replace function approve_submission(
  submission_id uuid,
  final_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_product_id uuid;
  sub submissions%rowtype;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into sub from submissions
   where id = submission_id and status = 'pending'
   for update;

  if not found then
    raise exception 'submission not found or already reviewed';
  end if;

  insert into products (
    barcode, name, brand, category, subcategory, ingredients_text,
    result_tier, result_label, confidence_tier, matched_terms,
    guidance_text, config_version, source_submission_id, created_by
  ) values (
    nullif(final_payload->>'barcode',''),
    final_payload->>'name',
    final_payload->>'brand',
    (final_payload->>'category')::product_category,
    final_payload->>'subcategory',
    final_payload->>'ingredients_text',
    (final_payload->>'result_tier')::verdict_tier,
    final_payload->>'result_label',
    (final_payload->>'confidence_tier')::verdict_tier,
    coalesce(final_payload->'matched_terms','[]'::jsonb),
    final_payload->>'guidance_text',
    final_payload->>'config_version',
    sub.id,
    auth.uid()
  )
  returning id into new_product_id;

  update submissions
     set status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = submission_id;

  return new_product_id;
end;
$$;

revoke execute on function approve_submission from anon;
grant   execute on function approve_submission to authenticated;
