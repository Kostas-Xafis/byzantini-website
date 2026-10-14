-- 0007_fee_rules.sql — the fee catalog's prices become rules (docs/FEES.md §2).
--
-- A pure forward migration on top of 0006 (production already runs 0006 + the backfill): it only restructures
-- the catalogs — no enrollment is touched, re-pinned or repriced.
--
-- A catalog version = its settings (fee_catalogs.evaluation_fee, fee_catalogs.multi_enrollment_factor) + a
-- list of price rules (fee_catalog_rules). Every existing catalog's JSON (`fee_catalogs.data`, migration
-- 0006) is converted here; the column itself stays as legacy (see the end of this file). Catalog ids do not change, so every pinned
-- `pupil_enrollments.fee_catalog_id` stays valid and prices exactly as before:
--   byzantine.default        → a department base rule        (class_id 0, all class years, no teacher)
--   byzantine.teachers[id]   → a teacher rule                (class_id 0, all class years, teacher_id)
--   traditional[class_year]  → one rule per distinct price   (class_id 1, the class years with that price)
--   european.default         → a department base rule        (class_id 2)
--
-- Apply:  bunx wrangler d1 migrations apply DB --local
-- Verify: bun run db:query -- "SELECT catalog_id, class_id, class_years, teacher_id, price FROM fee_catalog_rules"

CREATE TABLE IF NOT EXISTS fee_catalog_rules (
	id          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	catalog_id  INTEGER NOT NULL REFERENCES fee_catalogs (id),
	class_id    INTEGER NOT NULL,            -- 0 Βυζαντινή, 1 Παραδοσιακή, 2 Ευρωπαϊκή
	class_years TEXT,                        -- JSON array of class years; NULL = every class year of the department
	teacher_id  INTEGER,                     -- NULL = any teacher
	price       INTEGER NOT NULL             -- whole euros
);

CREATE INDEX IF NOT EXISTS idx_fee_catalog_rules_catalog ON fee_catalog_rules (catalog_id);

ALTER TABLE fee_catalogs ADD COLUMN evaluation_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fee_catalogs ADD COLUMN multi_enrollment_factor REAL NOT NULL DEFAULT 0.5;

UPDATE fee_catalogs
SET
	evaluation_fee = json_extract(data, '$.evaluation_fee'),
	multi_enrollment_factor = json_extract(data, '$.multi_enrollment_factor');

-- One INSERT, ordered by catalog → department → kind, so rule ids read naturally.
INSERT INTO fee_catalog_rules (catalog_id, class_id, class_years, teacher_id, price)
SELECT catalog_id, class_id, class_years, teacher_id, price
FROM (
	-- Βυζαντινή: department base
	SELECT c.id AS catalog_id, 0 AS class_id, NULL AS class_years, NULL AS teacher_id,
		json_extract(c.data, '$.byzantine.default') AS price, 0 AS kind, 0 AS sort
	FROM fee_catalogs c
	WHERE json_extract(c.data, '$.byzantine.default') IS NOT NULL
	UNION ALL
	-- Βυζαντινή: the non-affiliated teachers
	SELECT c.id, 0, NULL, CAST(t.key AS INTEGER), t.value, 1, t.id
	FROM fee_catalogs c, json_each(c.data, '$.byzantine.teachers') AS t
	UNION ALL
	-- Παραδοσιακή: one rule per distinct price, with its class years in catalog order
	SELECT catalog_id, 1, json_group_array(class_year), NULL, price, 2, MIN(sort)
	FROM (
		SELECT c.id AS catalog_id, t.key AS class_year, t.value AS price, t.id AS sort
		FROM fee_catalogs c, json_each(c.data, '$.traditional') AS t
		ORDER BY c.id, t.id
	)
	GROUP BY catalog_id, price
	UNION ALL
	-- Ευρωπαϊκή: department base
	SELECT c.id, 2, NULL, NULL, json_extract(c.data, '$.european.default'), 3, 0
	FROM fee_catalogs c
	WHERE json_extract(c.data, '$.european.default') IS NOT NULL
)
ORDER BY catalog_id, kind, sort;

-- `fee_catalogs.data` is LEGACY from here on and is deliberately NOT dropped: the previous worker version keeps
-- running between `migrations apply` and the deploy, and it reads `data`. The new code never reads it and
-- writes '{}' for new versions (the column is NOT NULL). Drop it in a later migration once this code is live.
-- Deploy order: apply 0007, deploy immediately after, no catalog edits in between.
