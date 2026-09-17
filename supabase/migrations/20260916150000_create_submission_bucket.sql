-- Submission image bucket. The storage policies (20260915232545) reference
-- bucket 'submission-images' but the bucket itself was never created — anon
-- uploads were 404ing with NoSuchBucket. Private bucket, 5MB cap, JPEG/PNG only
-- (SEC-05 bounds: magic-byte validation still lands Phase 7; the canvas
-- re-encode client-side guarantees an actual JPEG for the MVP path).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submission-images',
  'submission-images',
  false,
  5242880,
  array['image/jpeg', 'image/png']
)
on conflict (id) do nothing;