-- «Πρώην διδάσκων»: a teacher who no longer works for the school but is kept for the enrollment history
-- (the registry backfill, scripts/registryBackfill.ts, adds the old teachers of 2015-2023 this way).
-- A former teacher is also hidden (visible = 0) and has no teacher_classes rows, so the public site and the
-- enrollment forms never offer them; existing enrollments still show their name.
ALTER TABLE teachers ADD COLUMN former INTEGER NOT NULL DEFAULT 0;
