-- Pending-submission cap (04_BACKEND_STRUCTURE.md §2.3): reject a new
-- submission once a single coarse fingerprint already has N pending rows.
-- Anonymous users cannot SELECT submissions (RLS), so the /api/submissions
-- route gets the count through this SECURITY DEFINER function instead —
-- narrowly scoped (one int in, int out), never exposes row data.
create or replace function count_pending_submissions(fp text)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int from submissions
  where submitter_fingerprint = fp and status = 'pending';
$$;

revoke execute on function count_pending_submissions(text) from public;
grant   execute on function count_pending_submissions(text) to anon, authenticated;