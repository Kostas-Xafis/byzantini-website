/**
 * Unit tests for lib/sqlDump.ts — the in-app database backup.
 *
 * The literal/statement builders, plus a full round trip: an in-memory
 * bun:sqlite database built to hit every edge (quotes, NULL, Greek, newlines,
 * blobs, an AUTOINCREMENT gap, a trigger, a view, a forward foreign key, D1's
 * internal tables) is dumped, restored into a fresh database the way a D1
 * import runs it (one transaction, foreign keys on) and compared value by value.
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { dumpDatabase, insertStatement, quoteIdentifier, sqlLiteral, type QueryAll } from "../../lib/sqlDump";

describe("sqlLiteral", () => {
	test("NULL", () => {
		expect(sqlLiteral(null)).toBe("NULL");
		expect(sqlLiteral(undefined)).toBe("NULL");
	});

	test("numbers and booleans", () => {
		expect(sqlLiteral(0)).toBe("0");
		expect(sqlLiteral(-42)).toBe("-42");
		expect(sqlLiteral(12.5)).toBe("12.5");
		expect(sqlLiteral(1_760_000_000_000)).toBe("1760000000000");
		expect(sqlLiteral(2n ** 63n - 1n)).toBe("9223372036854775807");
		expect(sqlLiteral(Infinity)).toBe("1e999");
		expect(sqlLiteral(-Infinity)).toBe("-1e999");
		expect(sqlLiteral(NaN)).toBe("NULL");
		expect(sqlLiteral(true)).toBe("1");
		expect(sqlLiteral(false)).toBe("0");
	});

	test("strings: single quotes doubled, everything else verbatim", () => {
		expect(sqlLiteral("")).toBe("''");
		expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
		// The old JSON.stringify dump wrote these as "…" — an identifier in SQLite.
		expect(sqlLiteral('say "hi"')).toBe(`'say "hi"'`);
		expect(sqlLiteral("Βυζαντινή Μουσική")).toBe("'Βυζαντινή Μουσική'");
		expect(sqlLiteral("line 1\nline 2\r\n\ttab; -- not a comment")).toBe("'line 1\nline 2\r\n\ttab; -- not a comment'");
		expect(sqlLiteral("C:\\new\\table")).toBe("'C:\\new\\table'");
	});

	test("blobs", () => {
		expect(sqlLiteral(new Uint8Array([0, 255, 16]))).toBe("X'00ff10'");
		expect(sqlLiteral(new Uint8Array([1, 2]).buffer)).toBe("X'0102'");
		// D1 returns BLOB columns as arrays of bytes.
		expect(sqlLiteral([0, 255, 16])).toBe("X'00ff10'");
		expect(sqlLiteral(new Uint8Array(0))).toBe("X''");
		// A view into a larger buffer writes only its own bytes.
		expect(sqlLiteral(new Uint8Array([9, 1, 2, 9]).subarray(1, 3))).toBe("X'0102'");
	});

	test("rejects values SQLite cannot return", () => {
		expect(() => sqlLiteral({})).toThrow(TypeError);
		expect(() => sqlLiteral([1, 300])).toThrow(TypeError);
		expect(() => sqlLiteral(new Date())).toThrow(TypeError);
	});
});

test("quoteIdentifier / insertStatement", () => {
	expect(quoteIdentifier("pupils")).toBe('"pupils"');
	expect(quoteIdentifier('odd "name"')).toBe('"odd ""name"""');
	expect(insertStatement("class_type", { id: 0, name: "Βυζαντινή Μουσική" })).toBe(`INSERT INTO "class_type" ("id","name") VALUES(0,'Βυζαντινή Μουσική');`);
	expect(insertStatement("t", { "order": null, "a b": "x" })).toBe(`INSERT INTO "t" ("order","a b") VALUES(NULL,'x');`);
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS "d1_migrations"(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);
CREATE TABLE _cf_KV (key TEXT PRIMARY KEY, value BLOB);
CREATE TABLE pupil_enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, pupil_id INTEGER NOT NULL REFERENCES pupils (id), note TEXT);
CREATE TABLE pupils (id INTEGER PRIMARY KEY AUTOINCREMENT, am INTEGER, last_name TEXT NOT NULL, amount REAL, photo BLOB, needs_review INTEGER NOT NULL DEFAULT 0);
CREATE TABLE "odd ""name""" ("order" TEXT, "group" INTEGER);
CREATE TABLE audit (msg TEXT);
CREATE UNIQUE INDEX idx_pupils_am ON pupils (am) WHERE am IS NOT NULL;
CREATE VIEW reviewed AS SELECT id, last_name FROM pupils WHERE needs_review = 0;
CREATE TRIGGER pupils_audit AFTER INSERT ON pupils BEGIN INSERT INTO audit VALUES ('added; ' || NEW.last_name); END;
`;

function sourceDatabase() {
	const db = new Database(":memory:");
	db.run(SCHEMA);
	db.run("INSERT INTO d1_migrations (name, applied_at) VALUES ('0001_initial_schema.sql', '2026-09-01 10:00:00')");
	db.run("INSERT INTO _cf_KV VALUES ('k', X'00')");
	const pupil = db.prepare("INSERT INTO pupils (am, last_name, amount, photo, needs_review) VALUES (?, ?, ?, ?, ?)");
	pupil.run(706, "Παπαδόπουλος", 12.5, new Uint8Array([0, 1, 2, 255]), 0);
	pupil.run(null, `O'Brien "Jr"`, null, null, 1);
	pupil.run(707, "Line 1\nLine 2; DROP TABLE pupils; --", 1 / 3, new Uint8Array(0), 0);
	pupil.run(708, "deleted later", 0.1, null, 0);
	db.run("DELETE FROM pupils WHERE id = 4"); // sqlite_sequence stays at 4
	db.run("INSERT INTO pupil_enrollments (pupil_id, note) VALUES (1, 'a'), (3, NULL)");
	db.run(`INSERT INTO "odd ""name""" VALUES ('x', 1)`);
	db.run("ANALYZE"); // creates sqlite_stat1, which a dump must not try to CREATE
	return db;
}

/** Answers like the D1 binding: blobs as byte arrays, `_cf_*` tables unreadable. */
const d1Like =
	(db: Database): QueryAll =>
	async (sql) => {
		if (!sql.includes("sqlite_master") && sql.includes("_cf_")) throw new Error("access to _cf_KV.key is prohibited: SQLITE_AUTH");
		const rows = db.query(sql).all() as Record<string, unknown>[];
		return rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Uint8Array ? Array.from(v) : v])));
	};

const userTables = (db: Database) =>
	(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name").all() as { name: string }[]).map(
		(t) => t.name,
	);
const schemaOf = (db: Database) =>
	db.query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_stat*' AND tbl_name NOT GLOB '_cf_*' ORDER BY type, name").all();
/** Every row with every value AND its storage class, so 1 vs 1.0 vs '1' would differ. */
const contentOf = (db: Database, table: string) => {
	const columns = (db.query(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as { name: string }[]).map((c) => quoteIdentifier(c.name));
	const types = columns.map((c) => `typeof(${c})`).join(", ");
	return db.query(`SELECT *, ${types} FROM ${quoteIdentifier(table)} ORDER BY rowid`).values();
};

describe("dumpDatabase round trip", async () => {
	const source = sourceDatabase();
	const dump = await dumpDatabase(d1Like(source));
	const restored = new Database(":memory:");
	restored.run("PRAGMA foreign_keys = ON");
	// A D1 import runs the whole file in one transaction.
	restored.transaction(() => restored.run(dump))();

	test("the dump has the wrangler d1 export shape", () => {
		expect(dump.startsWith("PRAGMA defer_foreign_keys=TRUE;\n")).toBe(true);
		expect(dump).not.toContain("BEGIN TRANSACTION");
		expect(dump).not.toContain("journal_mode");
		expect(dump).not.toContain("_cf_KV");
		expect(dump).not.toMatch(/CREATE TABLE "?sqlite_/);
		expect(dump).toContain(`INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0001_initial_schema.sql','2026-09-01 10:00:00');`);
	});

	test("restores the same schema", () => {
		expect(schemaOf(restored)).toEqual(schemaOf(source));
	});

	test("restores every row with the same values and storage classes", () => {
		expect(userTables(restored)).toEqual(userTables(source));
		for (const table of userTables(source)) {
			expect(contentOf(restored, table)).toEqual(contentOf(source, table));
		}
		expect(restored.query("SELECT * FROM sqlite_sequence ORDER BY name").all()).toEqual(source.query("SELECT * FROM sqlite_sequence ORDER BY name").all());
	});

	test("triggers are created after the data, and still work", () => {
		// Four inserts fired the trigger in the source; the restore must not add more.
		expect(restored.query("SELECT count(*) AS n FROM audit").get()).toEqual({ n: 4 });
		restored.run("INSERT INTO pupils (am, last_name) VALUES (709, 'new')");
		expect(restored.query("SELECT count(*) AS n FROM audit").get()).toEqual({ n: 5 });
	});

	test("AUTOINCREMENT continues after the deleted id, foreign keys hold, the view works", () => {
		expect(restored.query("SELECT id FROM pupils WHERE am = 709").get()).toEqual({ id: 5 });
		expect(restored.query("PRAGMA foreign_key_check").all()).toEqual([]);
		expect(restored.query("SELECT count(*) AS n FROM reviewed").get()).toEqual({ n: 3 });
	});
});
