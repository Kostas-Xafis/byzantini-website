import { createDbConnection } from "@lib/db";
import { deepCopy } from "@utilities/objects";
import { execTryCatch, silentImport } from "../utils.server";
import { SchemaRoutes } from "./schema.client";
import { CLI } from "@utilities/cli";

const serverRoutes = deepCopy(SchemaRoutes);
const fs = await silentImport<typeof import("fs")>("fs/promises");
const fsp = await silentImport<typeof import("fs/promises")>("fs/promises");
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
	}, "Σφάλμα κατά την ανάκτηση του σχήματος");
};

// This is development only route
serverRoutes.revertToPreviousSchema.func = ({ slug }) => {
	return execTryCatch(async () => {
		const { type } = slug;
		const { SAFE_BACKUP_SNAPSHOT } = import.meta.env;
		if (!SAFE_BACKUP_SNAPSHOT) {
			throw Error("No safe schema found");
		}

		if (type === "sqlite") {
			const sqliteConn = createDbConnection("sqlite-dev");
			await sqliteConn.execute(await fsp.readFile(SAFE_BACKUP_SNAPSHOT, "utf-8"));
			return "Reverted to previous schema";
		}
		throw Error(`The ${type} connector not supported anymore`);
	}, "Σφάλμα κατά την ανάκτηση του προηγούμενου σχήματος");
};

serverRoutes.migrate.func = ({ ctx: _ctx }) => {
	return execTryCatch(async () => {
		const { CONNECTOR, SAFE_BACKUP_SNAPSHOT, PROJECT_ABSOLUTE_PATH } = import.meta.env;
		if (CONNECTOR === "mysql") {
			throw Error(`Cannot revert schema for '${CONNECTOR}' connector`);
		}
		if (SAFE_BACKUP_SNAPSHOT && !(fs.existsSync(SAFE_BACKUP_SNAPSHOT))) {
			throw Error("No safe schema found. Please create a safe schema before migrating");
		}
		if (CONNECTOR !== "sqlite-dev") {
			throw Error(`The ${CONNECTOR} connector is not supported for migration`);
		}
		await CLI.executeCommands([
			`cd ${PROJECT_ABSOLUTE_PATH}/dbSnapshots`,
			`sqlite3 latest.db < ./migrations/latest.sql`,
		]);
		return "Migrated to latest schema";
	}, "Σφάλμα κατά την μεταφορά στο τελευταίο σχήμα");
};


export const SchemaServerRoutes = serverRoutes;
