alter table submissions
  add column front_photo_path text
    check (front_photo_path is null or front_photo_path ~ '^pending/[a-z0-9-]+\.jpe?g$'),
  add column gmo_status text
    check (gmo_status is null or gmo_status in ('non_gmo_certified', 'contains_gmo', 'not_sure'));
