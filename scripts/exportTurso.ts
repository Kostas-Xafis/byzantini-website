// Turso → SQL dump (data only) for the D1 import. Values never printed.
import { createClient } from "@libsql/client";
import { parseEnvFile } from "../lib/utilities/envFile";
import { writeFileSync } from "node:fs";

const vars = parseEnvFile(await Bun.file(".dev.vars").text());
const client = createClient({ url: vars.TURSO_DB_URL, authToken: vars.TURSO_DB_TOKEN });

const tables = await client.execute(
	'SELECT name FROM sqlite_master WHERE type="table" AND sql IS NOT NULL AND name != "sqlite_sequence" ORDER BY name',
);

const inserts: string[] = [];
let total = 0;

for (const row of tables.rows) {
	const tableName = String(row[0]);
	const res = await client.execute(`SELECT * FROM "${tableName}"`);
	const rows = res.rows;
	if (!rows.length) continue;
	const columns = res.columns;
	for (const r of rows) {
		const values = columns
			.map((col) => {
				const v = (r as any)[col];
				if (v === null || v === undefined) return "NULL";
				if (typeof v === "number") return String(v);
				// SQLite string literal with '' escaping (JSON escaping is NOT valid SQL)
				return "'" + String(v).replaceAll("'", "''") + "'";
			})
			.join(", ");
		inserts.push(
			`INSERT INTO ${tableName} (${columns.map((c) => JSON.stringify(String(c))).join(", ")}) VALUES (${values});`,
		);
		total += 1;
	}
	console.log(`exported ${tableName}: ${rows.length}`);
}

writeFileSync("/tmp/prod-data.sql", inserts.join("\n") + "\n");
console.log("TOTAL exported rows:", total);
client.close();
