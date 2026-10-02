-- Correct a misspelling in a seeded product name.
--
-- "Native Whitening Toothpaste Flouride-Free" -> "... Fluoride-Free".
--
-- Cosmetic for matching (trigram similarity still finds it), but the catalogue is
-- user-facing and every other row spells it correctly.
--
-- Idempotent: re-running matches zero rows and is a no-op.
-- Transactional: wrapped so a failure cannot leave a partial rename.
--
-- Apply: Supabase Dashboard -> SQL Editor -> New query -> Run.

begin;

update products
   set name = 'Native Whitening Toothpaste Fluoride-Free'
 where name = 'Native Whitening Toothpaste Flouride-Free';

-- Verify: expect 0 misspelled rows and 1 corrected row.
select
  count(*) filter (where name like '%Flouride%') as still_misspelled,
  count(*) filter (where name = 'Native Whitening Toothpaste Fluoride-Free') as corrected
from products;

commit;
