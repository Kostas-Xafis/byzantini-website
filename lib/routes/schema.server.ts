import { Env } from "@env/env";
import { createDbConnection } from "@lib/db";
import { deepCopy } from "@utilities/objects";
import { execTryCatch, executeTransaction, silentImport } from "../utils.server";
import { SchemaRoutes } from "./schema.client";

const serverRoutes = deepCopy(SchemaRoutes);
const fsp = await silentImport<typeof import("fs/promises")>("fs/promises");

const assertSafeBackupSnapshotExists = async () => {
	const { SAFE_BACKUP_SNAPSHOT } = Env.env;
	if (!SAFE_BACKUP_SNAPSHOT) {
		throw Error("No safe schema found");
	}
	try {
		await fsp.access(SAFE_BACKUP_SNAPSHOT);
	} catch {
		throw Error("No safe schema found. Please create a safe schema before migrating");
	}
	return SAFE_BACKUP_SNAPSHOT;
};

const splitSqlStatements = (sql: string): string[] => {
	const statements: string[] = [];
	let curr = "";
	let inSingle = false;
	let inDouble = false;
	let inBacktick = false;

	for (let i = 0; i < sql.length; i++) {
		const ch = sql[i];
		const prev = sql[i - 1];

		if (ch === "'" && prev !== "\\" && !inDouble && !inBacktick) inSingle = !inSingle;
		else if (ch === '"' && prev !== "\\" && !inSingle && !inBacktick) inDouble = !inDouble;
		else if (ch === "`" && prev !== "\\" && !inSingle && !inDouble) inBacktick = !inBacktick;

		if (ch === ";" && !inSingle && !inDouble && !inBacktick) {
			const statement = curr.trim();
			if (statement) statements.push(statement);
			curr = "";
			continue;
		}
		curr += ch;
	}

	const tail = curr.trim();
	if (tail) statements.push(tail);

	return statements;
};
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
		const SAFE_BACKUP_SNAPSHOT = await assertSafeBackupSnapshotExists();

		if (type === "sqlite") {
			const sqliteConn = createDbConnection("sqlite-dev");
			await sqliteConn.execute(await fsp.readFile(SAFE_BACKUP_SNAPSHOT, "utf-8"));
			return "Reverted to previous schema";
		}
		throw Error(`The ${type} connector not supported anymore`);
	}, "Σφάλμα κατά την ανάκτηση του προηγούμενου σχήματος");
};

serverRoutes.migrate.func = ({ slug }) => {
	return execTryCatch(async () => {
		const { MODE, PROJECT_ABSOLUTE_PATH } = Env.env;
		if (MODE !== "development") {
			throw Error("Migration endpoint is only available in development mode");
		}

		await assertSafeBackupSnapshotExists();

		const { target } = slug;
		const dbType = target === "local" ? "sqlite-dev" : "sqlite-prod";
		const sql = await fsp.readFile(`${PROJECT_ABSOLUTE_PATH}/dbSnapshots/migrations/latest.sql`, "utf-8");
		const statements = splitSqlStatements(sql);
		if (statements.length === 0) {
			throw Error("Migration file is empty");
		}

		await executeTransaction(async (t) => {
			for (const statement of statements) {
				await t.executeQuery(statement);
			}
		}, dbType);

		return `Migrated ${target} database to latest schema`;
	}, "Σφάλμα κατά την μεταφορά στο τελευταίο σχήμα");
};


export const SchemaServerRoutes = serverRoutes;
