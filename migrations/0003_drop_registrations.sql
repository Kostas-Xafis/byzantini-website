-- 0003_drop_registrations.sql — retire the legacy registration table.
--
-- The backfill (scripts/migratePupils.ts) has already moved every row into
-- `pupils` + `pupil_enrollments`; `registrations` is now dead weight and its
-- personal columns are duplicated data. This migration removes it.
--
-- ⚠️ Apply ONLY after the backfill has been verified:
--     bun scripts/migratePupils.ts --db local            # dry run
--     bun scripts/migratePupils.ts --db local --apply
--     bun run db:query -- "SELECT COUNT(*) FROM pupils"  # expect 745
--     bunx wrangler d1 migrations apply DB --local       # ← this file
--
-- There is no rollback: restore from dbSnapshots/backups/ if needed.

DROP TABLE IF EXISTS registrations;
DROP TABLE IF EXISTS total_registrations;
