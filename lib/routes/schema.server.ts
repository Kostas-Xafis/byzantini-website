import { createDbConnection } from "../db";
import { executeCommands } from "../utils.cli";
import { deepCopy } from "../utils.client";
import { execTryCatch } from "../utils.server";
import { SchemaRoutes } from "./schema.client";

const serverRoutes = deepCopy(SchemaRoutes);

export const sqliteGenerateBackup = async () => {
	const new_schema = [];
	const conn = await createDbConnection("sqlite");
	const { rows: tables } = await conn.execute("SELECT * FROM sqlite_master WHERE type='table' AND sql!='' AND tbl_name!='sqlite_sequence'");
	for (const table of tables) {
		const tableName = table[2];
		const createTableSql = table[4];
		const { columns, rows } = await conn.execute(`SELECT * FROM ${tableName}`);
		const insertStatements = rows.map(row => {
			return `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${columns.map(col => JSON.stringify(row[col])).join(", ")});`;
		}).join("\n");
		new_schema.push(createTableSql);
		new_schema.push(insertStatements);
	}
	return new_schema.join("\n");
};

export const mysqlGenerateTables = async () => {
	const conn = await createDbConnection("mysql");

	const createTables = [];
	const [tables] = await conn.execute("SHOW TABLES");
	for (const table of tables as any[]) {
		const tableName = table[Object.keys(table)[0]];
		const [createTable] = await conn.execute(`SHOW CREATE TABLE ${tableName}`) as any[];
		const createTableSql = createTable[0]["Create Table"];
		createTables.push(createTableSql);
	}
	conn.end();
	return createTables;
};

export const mysqlGenerateBackup = async () => {
	const new_schema = [];
	const conn = await createDbConnection("mysql");

	const [tables] = await conn.execute("SHOW TABLES");
	for (const table of tables as any[]) {
		const tableName = table[Object.keys(table)[0]];
		const [createTable] = await conn.execute(`SHOW CREATE TABLE ${tableName}`) as any[];
		const createTableSql = createTable[0]["Create Table"];

		const [columns] = await conn.execute(`SHOW COLUMNS FROM ${tableName}`) as any[][];
		const [rows] = await conn.execute(`SELECT * FROM ${tableName}`) as any[][];
		const insertStatements = rows.map(row => {
			return `INSERT INTO ${tableName} (${columns.map(col => col.Field).join(", ")}) VALUES (${columns.map(col => JSON.stringify(row[col.Field])).join(", ")});`;
		}).join("\n");
		new_schema.push(createTableSql);
		new_schema.push(insertStatements);
	}
	conn.end();
	return new_schema.join("\n");
};

serverRoutes.get.func = ({ ctx, slug }) => {
	return execTryCatch(() => {
		const { type } = slug;
		if (type === "sqlite") {
			return sqliteGenerateBackup();
		} else if (type === "mysql") {
			return mysqlGenerateBackup();
		}
		throw Error(`The ${type} connector not supported`);
	});
};


// This is development only route
serverRoutes.revertToPreviousSchema.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		const { type } = slug;
		const { SAFE_BACKUP_SNAPSHOT } = await import.meta.env;
		if (!SAFE_BACKUP_SNAPSHOT) {
			throw Error("No safe schema found");
		}
		const { MYSQL_DB_PWD, MYSQL_DB_NAME } = await import.meta.env;
		if (type === "mysql") {
			const commands = [
				"cd C:/Users/poupa/Projects/Javascript/astro/byzantini-website/dbSnapshots",
				"$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8",
				`mysql --defaults-file='C:\\ProgramData\\MySQL\\MySQL Server 8.0\\my.ini' ${MYSQL_DB_NAME} -u root  -p${MYSQL_DB_PWD} -e 'SOURCE ${SAFE_BACKUP_SNAPSHOT} ;'`,
			];
			try {
				await executeCommands(commands);
				return "Reverted to previous schema";
			} catch (error) {
				console.error(error);
				throw Error("Failed to revert to previous schema");
			}
		} else if (type === "sqlite") {
			// I will have to create a local sqlite db
			// and then make dump file from the safe backup
			// and the convert it to sqlite compatible file with `mysql2sqlite` package
			// and then import it to the local sqlite db

			// This process must be executed in bash/wsl
			throw Error("The sqlite connector not supported yet");
		}
		throw Error(`The ${type} connector not supported`);
	});
};

serverRoutes.migrate.func = ({ ctx: _ctx }) => {
	return execTryCatch(async () => {
		const { CONNECTOR, SAFE_BACKUP_SNAPSHOT } = await import.meta.env;
		if (CONNECTOR !== "mysql") {
			throw Error(`Cannot revert schema for '${CONNECTOR}' connector`);
		}
		if (!SAFE_BACKUP_SNAPSHOT) {
			throw Error("No safe schema found. Please create a safe schema before migrating");
		}
		const { MYSQL_DB_PWD, MYSQL_DB_NAME } = await import.meta.env;
		const commands = [
			"cd C:/Users/poupa/Projects/Javascript/astro/byzantini-website/dbSnapshots/migrations",
			"ls | select name"
		];
		const migrationFiles = await executeCommands(commands) as string;
		const latestMigrationFile = migrationFiles
			.replaceAll("\r", "")
			.split("\n")
			.filter(str => str.includes("migration-"))
			.map((fileName) => {
				const [_, ...date] = fileName.replace(".sql", "").split("-");
				return [fileName, new Date("20" + date.join("-"))] as const;
			}).sort((a, b) => b[1].getTime() - a[1].getTime())[0][0];
		const migrationCommand =
			`mysql --defaults-file='C:\\ProgramData\\MySQL\\MySQL Server 8.0\\my.ini' ${MYSQL_DB_NAME} -u root  -p${MYSQL_DB_PWD} -e 'SOURCE C:/Users/poupa/Projects/Javascript/astro/byzantini-website/dbSnapshots/migrations/${latestMigrationFile} ;'`;

		await executeCommands(migrationCommand);

		return "Migrated to latest schema";
	});
};


export const SchemaServerRoutes = serverRoutes;
