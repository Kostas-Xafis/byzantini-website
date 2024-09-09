import { createDbConnection } from "../db";
import { deepCopy } from "../utils.client";
import { execTryCatch } from "../utils.server";
import { SchemaRoutes } from "./schema.client";

const serverRoutes = deepCopy(SchemaRoutes);

export const sqliteGenerateBackup = async () => {
	const new_schema = ["PRAGMA journal_mode=WAL;"];
	const conn = createDbConnection("sqlite-prod");
	const { rows: tables } = await conn.execute("SELECT * FROM sqlite_master WHERE type='table' AND sql!='' AND tbl_name!='sqlite_sequence'");
	for (const table of tables) {
		const tableName = table[2];
		const createTableSql = table[4] + ";";
		new_schema.push(createTableSql);
		const { columns, rows } = await conn.execute(`SELECT * FROM ${tableName}`);
		const insertStatements = rows.map(row => {
			return `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${columns.map(col => JSON.stringify(row[col])).join(", ")});`;
		}).join("\n").replaceAll("\\\"", "\"\"");
		new_schema.push(insertStatements);
	}
	return new_schema.join("\n");
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
	});
};

// This is development only route
serverRoutes.revertToPreviousSchema.func = ({ slug }) => {
	return execTryCatch(async () => {
		const { type } = slug;
		const { SAFE_BACKUP_SNAPSHOT } = import.meta.env;
		if (!SAFE_BACKUP_SNAPSHOT) {
			throw Error("No safe schema found");
		}
		const fs = (await eval('import("fs/promises")')) as typeof import("fs/promises");

		if (type === "sqlite") {
			const sqliteConn = createDbConnection("sqlite-dev");
			await sqliteConn.execute(await fs.readFile(SAFE_BACKUP_SNAPSHOT, "utf-8"));
			return "Reverted to previous schema";
		}
		throw Error(`The ${type} connector not supported anymore`);
	});
};

serverRoutes.migrate.func = ({ ctx: _ctx }) => {
	return execTryCatch(async () => {
		const { CONNECTOR, SAFE_BACKUP_SNAPSHOT, LATEST_MIGRATION_FILE } = import.meta.env;
		if (CONNECTOR !== "mysql") {
			throw Error(`Cannot revert schema for '${CONNECTOR}' connector`);
		}
		if (!SAFE_BACKUP_SNAPSHOT) {
			throw Error("No safe schema found. Please create a safe schema before migrating");
		}
		const fs = (await eval('import("fs/promises")')) as typeof import("fs/promises");
		const migrationFile = await fs.readFile(LATEST_MIGRATION_FILE, "utf-8");

		const sqliteConn = createDbConnection("sqlite-dev");
		await sqliteConn.execute(migrationFile);
		return "Migrated to latest schema";
	});
};


export const SchemaServerRoutes = serverRoutes;
