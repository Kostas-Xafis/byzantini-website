import { dbExec } from "@lib/db";
import { deepCopy } from "@utilities/objects";
import { execTryCatch } from "../utils.server";
import { SchemaRoutes } from "./schema.client";

/**
 * Schema tooling — D1 edition.
 *
 * The old `revertToPreviousSchema` / `migrate` routes (fs + connector based)
 * do not exist under the Workers runtime; `wrangler d1 migrations` is the
 * replacement (see docs/MIGRATION_SPEC.md, Phase 4).
 */

const serverRoutes = deepCopy(SchemaRoutes);

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

serverRoutes.get.func = ({ slug }) => {
	return execTryCatch(() => {
		const { type } = slug;
		if (type === "sqlite") {
			return sqliteGenerateBackup();
		} else if (type === "mysql") {
			throw Error("MySQL is not supported anymore");
		}
		throw Error(`The ${type} connector not supported`);
	}, "Σφάλμα κατά την ανάκτηση του σχήματος");
};

export const SchemaServerRoutes = serverRoutes;
