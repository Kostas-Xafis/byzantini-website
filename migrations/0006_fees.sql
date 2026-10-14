-- 0006_fees.sql — automatic yearly fees + «Υπό Κατάταξη» as a status (docs/FEES.md).
--
-- 1. pupil_enrollments gets the evaluation status and the fee columns (FEES.md §1, §3).
-- 2. fee_catalogs: the versioned, immutable price catalog; seeded for 2026-2027 (FEES.md §2).
-- 3. Every class_year = 'Υπό Κατάταξη' row becomes evaluation = 1, class_year = ''. Rows of school years
--    before 2026-2027 flag their pupil for review first (the note is APPENDED to any existing one).
--
-- Fees of existing rows are NOT computed here: `bun run fees:backfill` pins the 2026-2027 catalog on that
-- year's enrollments (dry run by default). Older years keep fee_catalog_id = NULL (no automatic fees).
--
-- Apply:  bunx wrangler d1 migrations apply DB --local
-- Verify: bun run db:query -- "SELECT evaluation, COUNT(*) FROM pupil_enrollments GROUP BY evaluation"

-- Immutable rows: editing a catalog inserts a new version; the active one is the newest of its school year.
CREATE TABLE IF NOT EXISTS fee_catalogs (
	id          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	school_year TEXT    NOT NULL,
	data        TEXT    NOT NULL, -- JSON, see lib/fees (z_FeeCatalogData)
	created_at  INTEGER NOT NULL,
	created_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_fee_catalogs_year ON fee_catalogs (school_year, id);

ALTER TABLE pupil_enrollments ADD COLUMN evaluation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pupil_enrollments ADD COLUMN fee_catalog_id INTEGER REFERENCES fee_catalogs (id);
ALTER TABLE pupil_enrollments ADD COLUMN fee_base INTEGER;
ALTER TABLE pupil_enrollments ADD COLUMN evaluation_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pupil_enrollments ADD COLUMN fee_manual INTEGER NOT NULL DEFAULT 0;

-- Seed: the 2026-2027 catalog. The non-affiliated teachers are looked up by name (never hard-coded ids);
-- a name that is not found is simply left out of the map.
INSERT INTO fee_catalogs (school_year, data, created_at, created_by)
SELECT
	'2026-2027',
	json_object(
		'evaluation_fee', 80,
		'byzantine', json_object(
			'default', 20,
			-- json(): a subquery drops the JSON subtype, which would store the map as a quoted string.
			'teachers', json((
				SELECT json_group_object(CAST(id AS TEXT), 50)
				FROM teachers
				WHERE fullname IN ('Νικόλαος Ταπραντζής', 'Ιωάννης Χαβιαρλής')
			))
		),
		'traditional', json_object(
			'Α'' Προκαταρκτική', 50,
			'Α'' Κατωτέρα', 50,
			'Β'' Κατωτέρα', 50,
			'Α'' Μέση', 50,
			'Β'' Μέση', 50,
			'Γ'' Μέση', 50,
			'Α'' Ανωτέρα', 100,
			'Β'' Ανωτέρα', 100,
			'Α'' Διπλώματος', 100,
			'Β'' Διπλώματος', 100
		),
		'european', json_object('default', 50),
		'multi_enrollment_factor', 0.5
	),
	CAST(strftime('%s', 'now') AS INTEGER) * 1000,
	'migration 0006'
WHERE NOT EXISTS (SELECT 1 FROM fee_catalogs WHERE school_year = '2026-2027');

-- Pre-2026-27 evaluation rows: flag their pupils for review, appending one note per school year.
UPDATE pupils
SET
	needs_review = 1,
	review_note = CASE
		WHEN review_note = '' THEN notes.note
		ELSE review_note || '; ' || notes.note
	END
FROM (
	SELECT pupil_id, GROUP_CONCAT('Υπό Κατάταξη ' || registration_year || ': ορίστε το έτος φοίτησης', '; ') AS note
	FROM (
		SELECT DISTINCT pupil_id, registration_year
		FROM pupil_enrollments
		WHERE class_year = 'Υπό Κατάταξη' AND registration_year < '2026-2027'
		ORDER BY pupil_id, registration_year
	)
	GROUP BY pupil_id
) AS notes
WHERE pupils.id = notes.pupil_id;

-- «Υπό Κατάταξη» is a status now, not a class year.
UPDATE pupil_enrollments SET evaluation = 1, class_year = '' WHERE class_year = 'Υπό Κατάταξη';
