import { deepCopy } from "../utils.client";
import { execTryCatch } from "../utils.server";
import { SchemaRoutes } from "./schema.client";
import { createClient } from "@libsql/client";

const serverRoutes = deepCopy(SchemaRoutes);

serverRoutes.get.func = ({ ctx, slug }) => {
	return execTryCatch(async () => {
		const { type } = slug;

		const { CONNECTOR } = await import.meta.env;
		if (!CONNECTOR) throw Error("Missing environment variables");
		if (type !== CONNECTOR) throw Error("Cannot get schema for this connector");

		const new_schema = [];
		if (CONNECTOR === "sqlite") {
			console.log("Getting schema for sqlite");
			const { TURSO_DB_URL, TURSO_DB_TOKEN } = await import.meta.env;
			const conn = createClient({
				url: TURSO_DB_URL,
				authToken: TURSO_DB_TOKEN,
				intMode: "number",
			});
			const { rows: tables } = await conn.execute("SELECT * FROM sqlite_master WHERE type='table' AND sql!='' AND tbl_name!='sqlite_sequence'");
			console.log(tables);
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
		} else {
			console.log("Getting schema for mysql");
			const { MYSQL_DB_HOST, MYSQL_DB_PORT, MYSQL_DB_USERNAME, MYSQL_DB_PWD, MYSQL_DB_NAME } = await import.meta.env;

			const mysql = await eval(`import("mysql2/promise")`) as typeof import("mysql2/promise");
			const db = await mysql.createConnection({
				user: MYSQL_DB_USERNAME,
				database: MYSQL_DB_NAME,
				password: MYSQL_DB_PWD,
				host: MYSQL_DB_HOST,
				port: MYSQL_DB_PORT,
				multipleStatements: false
			});
			const [tables] = await db.execute("SHOW TABLES");
			for (const table of tables as any[]) {
				const tableName = table[Object.keys(table)[0]];
				const [createTable] = await db.execute(`SHOW CREATE TABLE ${tableName}`) as any[];
				const createTableSql = createTable[0]["Create Table"];

				const [columns] = await db.execute(`SHOW COLUMNS FROM ${tableName}`) as any[][];
				const [rows] = await db.execute(`SELECT * FROM ${tableName}`) as any[][];
				const insertStatements = rows.map(row => {
					return `INSERT INTO ${tableName} (${columns.map(col => col.Field).join(", ")}) VALUES (${columns.map(col => JSON.stringify(row[col.Field])).join(", ")});`;
				}).join("\n");
				new_schema.push(createTableSql);
				new_schema.push(insertStatements);
			}
			return new_schema.join("\n");
		}
	});
};


export const SchemaServerRoutes = serverRoutes;
