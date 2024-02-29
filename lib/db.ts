import { cast, connect } from "@planetscale/database";

export type ExecReturn<T> = { insertId: '0', rows: T[]; };
export type Exec = <T = undefined>(query: string, args?: any[], _?: any) => Promise<T extends undefined ? { insertId: string; } : ExecReturn<T>>;

export type Transaction = {
	execute: Exec,
	executeQuery: <T = undefined>(query: string, args?: any[], log?: boolean) => Promise<T extends undefined ? { insertId: number; } : T[]>,
	queryHistory: string[];
};

export type Connection = {
	execute: Exec,
	transaction: (func: (tx: Transaction) => any) => Promise<any>;
};

export const CreateDbConnection = async (): Promise<Connection> => {
	const { DB_PWD, DB_HOST, DB_USERNAME, CONNECTOR, DB_NAME, DB_PORT } = await import.meta.env;
	try {
		if (CONNECTOR === "mysql") {
			// Exposing mysql2/promise package in dev as an api, wrapped with the functions of @planetscale/database
			// to allow for quick local development

			// This is the worst, ugliest, most stupid & most shameful line of code I've ever written
			const mysql = await eval(`import("mysql2/promise")`) as typeof import("mysql2/promise");
			const db = await mysql.createConnection({
				user: DB_USERNAME,
				database: DB_NAME,
				password: DB_PWD,
				host: DB_HOST,
				port: DB_PORT,
				multipleStatements: false
			});
			const execute: Exec = async function <T = undefined>(query: string, args: any[] = [], _?: any) {
				try {
					const [res] = await db.execute(query, args) as unknown as [{ insertId: number; } | T[]];
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
				transaction: async (func) => {
					await db.beginTransaction();
					let res;
					try {
						res = await func({ execute } as Transaction);
						await db.commit();
					} catch (error) {
						await db.rollback();
					}
					db.end();
					return res;
				}
			};
		}
		return connect({
			host: DB_HOST,
			password: DB_PWD,
			username: DB_USERNAME,
			fetch: (url, init) => {
				delete (init as any)["cache"]; // Remove cache header
				return fetch(url, init);
			},
			cast(field, value) {
				console.log({ field, value });
				if (field.type === 'INT64' || field.type === 'UINT64') {
					return Number(value);
				}
				return cast(field, value);
			},
		}) as unknown as Connection;
	} catch (error) {
		throw new Error(error as any);
	}
};
