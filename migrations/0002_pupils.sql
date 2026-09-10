-- 0002_pupils.sql — pupil register (Μαθητολόγιο): identity + enrollment history.
--
-- Adds the two new tables and the totals accumulator. Purely additive: nothing
-- existing is altered or dropped, so it is safe to apply while the backfill
-- script (scripts/migratePupils.ts) reads the legacy `registrations` table.
--
-- The legacy tables are dropped later, in 0003_drop_registrations.sql, and only
-- after the backfill has been verified (see docs/PUPILS_MIGRATION.md, D7/D12/Q5).
--
-- Apply:  bunx wrangler d1 migrations apply DB --local
-- Verify: bun run db:query -- "SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name LIKE '%pupil%'"

-- Person identity, keyed by Αριθμός Μητρώου (ΑΜ).
--   am              INTEGER — NULL means the pupil has no usable ΑΜ (see
--                   split_from_am / orphan_code); a real registry number lives here.
--   orphan_code     TEXT — the human-facing review code (000-1, 111-2, …).
--   split_from_am   INTEGER — set when this row was SPLIT OFF a real ΑΜ because
--                   two different people shared it; keeps the origin visible to
--                   the secretaries and makes the split reversible.
--   amka            TEXT — '' is valid: it was not collected in earlier years.
--   registration_url TEXT — the permanent re-registration deep link, seeded
--                   from the pupil's 2025-2026 registration so already-emailed
--                   links keep working forever.
CREATE TABLE IF NOT EXISTS pupils (
	id               INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	am               INTEGER,
	orphan_code      TEXT    NOT NULL DEFAULT '',
	split_from_am    INTEGER,
	first_name       TEXT    NOT NULL,
	last_name        TEXT    NOT NULL,
	fathers_name     TEXT    NOT NULL DEFAULT '',
	birth_date       INTEGER NOT NULL DEFAULT 0,
	road             TEXT    NOT NULL DEFAULT '',
	number           INTEGER NOT NULL DEFAULT 0,
	tk               INTEGER NOT NULL DEFAULT 0,
	region           TEXT    NOT NULL DEFAULT '',
	telephone        TEXT    NOT NULL DEFAULT '-',
	cellphone        TEXT    NOT NULL DEFAULT '',
	email            TEXT    NOT NULL DEFAULT '',
	amka             TEXT    NOT NULL DEFAULT '',
	registration_url TEXT    NOT NULL DEFAULT '',
	needs_review     INTEGER NOT NULL DEFAULT 0,
	review_note      TEXT    NOT NULL DEFAULT '',
	created_at       INTEGER NOT NULL DEFAULT 0,
	updated_at       INTEGER NOT NULL DEFAULT 0
);

-- Partial unique indexes: orphans (am IS NULL) and blank links are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pupils_am  ON pupils (am) WHERE am IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pupils_url ON pupils (registration_url) WHERE registration_url <> '';
CREATE INDEX IF NOT EXISTS idx_pupils_name ON pupils (last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_pupils_amka ON pupils (amka) WHERE amka <> '';

-- Enrollment history: one row per pupil / school year / music type / instrument.
-- class_id is the music type (0 = Βυζαντινή, 1 = Παραδοσιακή, 2 = Ευρωπαϊκή), so
-- the Μαθητολόγιο tabs are a plain `WHERE class_id = ?` filter. instrument_id is
-- 0 for Byzantine (no instrument) and for theory-only classes.
CREATE TABLE IF NOT EXISTS pupil_enrollments (
	id                INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	pupil_id          INTEGER NOT NULL REFERENCES pupils (id),
	registration_year TEXT    NOT NULL,
	class_id          INTEGER NOT NULL,
	class_year        TEXT    NOT NULL DEFAULT '',
	teacher_id        INTEGER NOT NULL DEFAULT -1,
	instrument_id     INTEGER NOT NULL DEFAULT 0,
	date              INTEGER NOT NULL DEFAULT 0,
	payment_amount    INTEGER NOT NULL DEFAULT 0,
	total_payment     INTEGER NOT NULL DEFAULT 0,
	payment_date      INTEGER,
	pass              INTEGER NOT NULL DEFAULT 0,
	source            TEXT    NOT NULL DEFAULT 'migration',
	created_at        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_enrollments_pupil  ON pupil_enrollments (pupil_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_year   ON pupil_enrollments (registration_year);
CREATE INDEX IF NOT EXISTS idx_enrollments_lookup ON pupil_enrollments (pupil_id, class_id, registration_year);
CREATE INDEX IF NOT EXISTS idx_enrollments_teacher ON pupil_enrollments (teacher_id);

-- Replaces the hand-maintained `total_registrations` counter: counts enrollment
-- rows (not people), so the dashboard stays comparable year over year.
CREATE TABLE IF NOT EXISTS total_enrollments (amount INTEGER DEFAULT 0);

INSERT INTO total_enrollments (amount)
SELECT 0
WHERE NOT EXISTS (SELECT 1 FROM total_enrollments);
