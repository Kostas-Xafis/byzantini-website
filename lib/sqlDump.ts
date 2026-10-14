/**
 * SQL dump of the database — the in-app backup behind `SettingsBackup.getDatabase`.
 *
 * The output follows `wrangler d1 export` (the format `bun run db:reset` already
 * restores), so a backup restores into an EMPTY database with either
 *   bunx wrangler d1 execute <db> --file backup.sql     (D1, local or --remote)
 *   sqlite3 restored.db < backup.sql                     (plain SQLite)
 *
 * - `PRAGMA defer_foreign_keys=TRUE;` rather than `.dump`'s `BEGIN TRANSACTION; … COMMIT;`:
 *   D1 runs an import in a transaction of its own, and wrangler strips the first
 *   `BEGIN TRANSACTION;` / `COMMIT;` substrings it finds — even inside a value.
 * - Every CREATE TABLE first, then the rows as INSERTs of SQL literals (`sqlLiteral`;
 *   identifiers always double-quoted). D1 enforces foreign keys: the deferred check
 *   lets rows arrive in any order, but a parent table must exist before its first child
 *   row, and a table may reference one created after it.
 * - `sqlite_sequence` is restored, so AUTOINCREMENT ids continue where they were.
 * - Indexes, views and triggers come last, so no trigger fires while rows are restored.
 * - D1/workerd internal tables (`_cf_*`) are skipped: reading them fails with
 *   SQLITE_AUTH, and a new D1 database creates its own. `d1_migrations` is kept: it
 *   records which migrations the restored schema already has.
 * - Not handled (none exist): virtual tables and generated columns.
 *
 * Pure: the caller passes the query function, so it is unit-tested against
 * `bun:sqlite` (tests/unit/sqlDump.test.ts).
 */

export type QueryAll = (sql: string) => Promise<Record<string, unknown>[]>;

/** `"name"`, with embedded double quotes doubled. */
export const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

const blobLiteral = (bytes: Uint8Array) => `X'${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}'`;
const isByteArray = (value: unknown[]) => value.every((b) => Number.isInteger(b) && (b as number) >= 0 && (b as number) <= 255);

/**
 * A value read from SQLite as an SQL literal: `NULL`, a number, a `'…'` string
 * (quotes doubled; newlines and any other character kept as is) or an `X'…'`
 * blob (D1 returns BLOB columns as arrays of bytes).
 */
export function sqlLiteral(value: unknown): string {
	if (value === null || value === undefined) return "NULL";
	switch (typeof value) {
		case "string":
			return `'${value.replaceAll("'", "''")}'`;
		case "number":
			if (Number.isFinite(value)) return String(value);
			// SQLite stores NaN as NULL; ±1e999 is how it spells ±Infinity.
			return Number.isNaN(value) ? "NULL" : value > 0 ? "1e999" : "-1e999";
		case "bigint":
			return value.toString();
		case "boolean":
			return value ? "1" : "0";
	}
	if (ArrayBuffer.isView(value)) return blobLiteral(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
	// Tag check instead of `instanceof`: buffers can come from another realm (workerd).
	if (Object.prototype.toString.call(value) === "[object ArrayBuffer]") return blobLiteral(new Uint8Array(value as ArrayBuffer));
	if (Array.isArray(value) && isByteArray(value)) return blobLiteral(Uint8Array.from(value));
	throw new TypeError(`Cannot write ${Object.prototype.toString.call(value)} as an SQL literal`);
}

/** `INSERT INTO "table" ("col",…) VALUES(…);` — the column list keeps a row valid even if columns were reordered. */
export function insertStatement(table: string, row: Record<string, unknown>): string {
	const columns = Object.keys(row);
	return `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(",")}) VALUES(${columns.map((c) => sqlLiteral(row[c])).join(",")});`;
}

/** Every schema object with SQL (autoindexes have none), in creation order. */
const SCHEMA_QUERY = "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB '_cf_*' AND tbl_name NOT GLOB '_cf_*' ORDER BY rowid";

/** Reserved names (`sqlite_sequence`, `sqlite_stat1`, …): SQLite creates and owns them. */
const isInternal = (name: string) => name.startsWith("sqlite_");

export async function dumpDatabase(queryAll: QueryAll): Promise<string> {
	const objects = (await queryAll(SCHEMA_QUERY)).map((o) => ({ type: String(o.type), name: String(o.name), sql: String(o.sql) }));
	const tables = objects.filter((o) => o.type === "table" && !isInternal(o.name));
	const out = ["PRAGMA defer_foreign_keys=TRUE;", ...tables.map((table) => `${table.sql};`)];

	for (const table of tables) {
		for (const row of await queryAll(`SELECT * FROM ${quoteIdentifier(table.name)}`)) {
			out.push(insertStatement(table.name, row));
		}
	}

	if (objects.some((o) => o.type === "table" && o.name === "sqlite_sequence")) {
		out.push("DELETE FROM sqlite_sequence;");
		for (const row of await queryAll("SELECT name, seq FROM sqlite_sequence")) {
			out.push(insertStatement("sqlite_sequence", row));
		}
	}

	for (const object of objects.filter((o) => o.type !== "table" && !isInternal(o.name))) {
		out.push(`${object.sql};`);
	}
	return out.join("\n") + "\n";
}
