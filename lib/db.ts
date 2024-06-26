import { createClient } from "@libsql/client";
import type { Insert } from "../types/entities";
export type ExecReturn<T> = { insertId: '0', rows: T[]; };
export type Exec = <T = undefined>(query: string, args?: any[], _?: any) => Promise<T extends undefined ? { insertId: string; } : ExecReturn<T>>;

export type Transaction = {
	execute: Exec,
	executeQuery: <T = undefined>(query: string, args?: any[], log?: boolean) => Promise<T extends undefined ? Insert : T[]>,
	queryHistory: string[];
};

export type DBConnection = {
	execute: Exec,
	transaction: (func: (tx: Transaction) => any) => Promise<any>;
};

type DBTypes = "mysql" | "sqlite" | undefined;

type PromiseReturn<DBType extends DBTypes = undefined> =
	DBType extends "mysql" ? import("mysql2/promise").Connection :
	DBType extends "sqlite" ? ReturnType<typeof createClient> :
	DBConnection;

export async function createDbConnection<T extends DBTypes = undefined>(type?: T): Promise<PromiseReturn<T>> {
	const {
		// Mysql env variables for local development
		MYSQL_DB_PWD, MYSQL_DB_HOST, MYSQL_DB_USERNAME, MYSQL_DB_NAME, MYSQL_DB_PORT,
		// Turso env variables for production
		TURSO_DB_URL, TURSO_DB_TOKEN,
		// Connector type
		CONNECTOR } = await import.meta.env;
	try {
		if (type === "mysql" || CONNECTOR === "mysql") {
			// Exposing mysql2/promise package in dev as an api, wrapped with the functions of @planetscale/database
			// to allow for quick local development

			// This is the worst, ugliest, most stupid & most shameful line of code I've ever written
			const mysql = await eval(`import("mysql2/promise")`) as typeof import("mysql2/promise");
			const db = await mysql.createConnection({
				user: MYSQL_DB_USERNAME,
				database: MYSQL_DB_NAME,
				password: MYSQL_DB_PWD,
				host: MYSQL_DB_HOST,
				port: MYSQL_DB_PORT,
				multipleStatements: false
			});
			if (type === "mysql") return db as any;
			const execute: Exec = async function <T = undefined>(query: string, args: any[] = [], _?: any) {
				try {
					const [res] = await db.execute(query, args) as unknown as [Insert | T[]];
					let resObj = {} as any;
					if ("insertId" in res) resObj["insertId"] = "" + res.insertId;
					else {
						resObj["insertId"] = "0";
						resObj["rows"] = res;
					}
					return resObj as T extends undefined ? { insertId: string; } : ExecReturn<T>;
				} catch (error) {
					db.end();
					throw new Error(error as any);
				}
			};
			return {
				execute: async <T>(query: string, args: any[] = [], _?: any) => {
					let res = await execute<T>(query, args);
					db.end();
					return res;
				},
				transaction: async (func: any) => {
					await db.beginTransaction();
					let res;
					try {
						res = await func({ execute } as Transaction);
						await db.commit();
					} catch (error) {
						await db.rollback();
						throw error;
					} finally {
						db.end();
					}
					return res;
				}
			} as DBConnection as any;
		}
		if (type === "sqlite" || CONNECTOR === "sqlite") {
			// ! SQLITE does not support LIMIT in UPDATE queries
			const client = createClient({
				url: TURSO_DB_URL,
				authToken: TURSO_DB_TOKEN,
				intMode: "number",
			});
			if (type === "sqlite") return client as any;

			const execute = async function <T = undefined>(query: string, args: any[] = [], _?: any) {
				let res = await client.execute({ sql: query, args });
				let resObj = {} as any;
				if (res.lastInsertRowid && !Number.isNaN(res.lastInsertRowid)) resObj.insertId = "" + res.lastInsertRowid;
				else {
					resObj.insertId = "0";
					resObj.rows = res.rows;
				}
				return resObj as T extends undefined ? { insertId: string; } : ExecReturn<T>;
			};

			return {
				execute: async <T>(query: string, args: any[] = [], _?: any) => {
					let res = await execute<T>(query, args);
					client.close();
					return res;
				},
				transaction: async (func) => {
					const t = await client.transaction("write");
					let res;
					try {
						res = await func({ execute } as Transaction);
						await t.commit();
					} catch (error) {
						await t.rollback();
						throw error;
					} finally {
						t.close();
						client.close();
					}
					return res;
				}
			} as DBConnection as any;
		}
		throw new Error("Database connector is not specified.");
	} catch (error) {
		throw new Error(error as any);
	}
};
