create policy submission_upload on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'submission-images'
    and (storage.foldername(name))[1] = 'pending'
  );

create policy submission_read_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'submission-images' and is_admin());
