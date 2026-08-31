import { dbExec } from "@lib/db";

/** D1 schema backup (moved from the old lib/routes/schema.server — kept as the admin tool). */
export const sqliteGenerateBackup = async () => {
	const newSchema = ["PRAGMA journal_mode=WAL;"];
	const { rows: tables } = await dbExec<{ type: string; name: string; tbl_name: string; sql: string | null }>(
		"SELECT * FROM sqlite_master WHERE type='table' AND sql IS NOT NULL AND sql != '' AND tbl_name != 'sqlite_sequence'",
	);
	for (const table of tables) {
		const tableName = table.name;
		const createTableSql = (table.sql as string) + ";";
		newSchema.push(createTableSql);
		const { rows } = await dbExec<Record<string, unknown>>(`SELECT * FROM ${tableName}`);
		const columns = Object.keys(rows[0] ?? {});
		const insertStatements = rows
			.map((row) => {
				return `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${columns.map((col) => JSON.stringify(row[col])).join(", ")});`;
			})
			.join("\n")
			.replaceAll('\\"', '""');
		newSchema.push(insertStatements);
	}
	return newSchema.join("\n");
};
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Schema — Phase 4 route group (contracts + handlers in one place).
 * Ported from lib/routes/schema.client|server.ts.
 *
 * Route key (`get`) mirrors the old `SchemaRoutes` exactly. The only remaining
 * route is the D1 sqlite backup; the retired `revertToPreviousSchema` / `migrate`
 * (fs + connector based) are handled by `wrangler d1 migrations`.
 */
export const schemaRoutes = {
	get: new APIServer(
		{ method: "GET", path: '/schema/backup/[type:"mysql" | "sqlite"]' },
		[authenticateMiddleware],
		({ params }) =>
			handlerResult(() => {
				const { type } = params;
				if (type === "sqlite") {
					return sqliteGenerateBackup();
				} else if (type === "mysql") {
					throw Error("MySQL is not supported anymore");
				}
				throw Error(`The ${type} connector not supported`);
			}, "Σφάλμα κατά την ανάκτηση του σχήματος"),
	),
};
