# Backend Structure & Database Design — SHF Final Resolve

**Platform:** Supabase (Postgres 15 · Auth · Storage · RLS)

---

## 1. Design principles

1. **One schema, both categories.** A `category` column, not parallel tables. Adding plant health later should be a new enum value, not a new table set.
2. **Anonymous users propose, admins publish.** Enforced by RLS, not by UI.
3. **Lookup tables are data rows, not code.** Versioned, fetchable, correctable without redeploy.
4. **Append-only audit trail on approvals.** Who approved what, when, and from which submission.

---

## 2. Schema

### 2.0 Required extension

```sql
create extension if not exists pg_trgm;
```

Needed for the trigram index and `similarity()` function used in product-name matching (§2.2, and see `02_SYSTEM_ARCHITECTURE.md` §6a) — the search-by-photographed-name path most local/unbranded products will actually use, since they won't have a barcode at all. Run this before creating `products`.

### 2.1 Enums

```sql
create type product_category as enum ('gmo_food', 'oral_care');
create type verdict_tier     as enum ('none', 'low', 'medium', 'high');
create type submission_status as enum ('pending', 'approved', 'rejected');
```

### 2.2 `products` — the verified dataset

```sql
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
```

The trigram index supports name-based lookup when a barcode isn't readable or doesn't exist — expect this to be the common path, not the fallback, given how much of the target shelf is informally packaged or locally branded.

### 2.3 `submissions` — the review queue

```sql
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
```

### 2.4 `lookup_config` — versioned rulesets

```sql
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
```

The partial unique index guarantees exactly one published config per category — no ambiguity about which ruleset is live.

### 2.5 `profiles` — role assignment

```sql
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);
```

Roles live in a table, not in JWT user metadata. User metadata is client-writable in some Supabase configurations; a table read inside an RLS policy is not.

---

## 3. Row Level Security

**Enable RLS on every table. No exceptions.** A table without RLS in Supabase is a table readable by anyone holding the anon key, which ships in your client bundle.

```sql
alter table products      enable row level security;
alter table submissions   enable row level security;
alter table lookup_config enable row level security;
alter table profiles      enable row level security;
```

### Helper

```sql
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
```

### Policies

```sql
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
```

Note the insert policy's `with check (status = 'pending')` — it prevents an anonymous client from inserting a row already marked `approved`.

---

## 4. Approval as a transaction

Approval touches two tables and must not half-complete. Do it in a `SECURITY DEFINER` function, not two client calls.

```sql
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
```

The `for update` lock prevents two admins double-approving the same submission into two duplicate product rows.

---

## 5. Storage

Bucket: `submission-images` — **private**, never public.

```sql
-- upload: anyone, but only into the pending prefix
create policy submission_upload on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'submission-images'
    and (storage.foldername(name))[1] = 'pending'
  );

-- read: admins only
create policy submission_read_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'submission-images' and is_admin());
```

Admin review fetches images via **signed URLs** with a short TTL (e.g. 60s), generated server-side. Never make the bucket public — these are user-submitted photos that may incidentally capture surroundings, faces, or receipts.

Enforce on upload: max 5MB, `image/jpeg` and `image/png` only, and re-encode client-side before upload (which also strips EXIF — see the Security document).

---

## 6. Server-side surface (Next.js Route Handlers)

Keep this minimal. Most reads go direct to Supabase with RLS.

| Route | Method | Purpose |
|---|---|---|
| `/api/submissions` | POST | Validate (Zod), rate-limit, insert submission |
| `/api/admin/approve` | POST | Auth check → call `approve_submission()` |
| `/api/admin/reject` | POST | Auth check → update status |
| `/api/ocr-fallback` | POST | Optional server OCR, feature-flagged, rate-limited |

Rule: the **service role key** is used only in Route Handlers, only server-side, and never reaches the browser bundle. If you find yourself importing it into a client component, stop.

---

## 7. Seed data

`supabase/seed.sql` should contain:
- Current published `lookup_config` rows for both categories (the GMO and fluoride spec JSON)
- 20–40 curated `products` rows, including local shelf products, so demos don't hit "no data" on every scan
- One admin profile for local development

---

## 8. Migrations

Use Supabase CLI migrations (`supabase/migrations/`), checked into the repo. Never apply schema changes through the dashboard on a shared environment — the migration file is the source of truth and the only thing that reproduces in staging and production.
