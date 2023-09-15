import { cast, connect, } from "@planetscale/database";
import * as mysql from "mysql2/promise";

export const CreateDbConnection = async () => {
	const { DB_PWD, DB_HOST, DB_USERNAME, CONNECTOR, DB_NAME } = await import.meta.env;
	if (CONNECTOR === "mysql") {
		const db = await mysql.createConnection({
			user: DB_USERNAME,
			database: DB_NAME,
			password: DB_PWD,
			host: DB_HOST,
			port: 3306,
			multipleStatements: false
		});
		type ExecReturn = { insertId: string, rows: any[] };
		async function execute(query: string, args: any[] = [], _?: any): Promise<ExecReturn> {
			try {
				const [res] = await db.execute(query, args);
				let resObj = {} as ExecReturn;
				if ("insertId" in res) resObj["insertId"] = "" + res.insertId;
				else {
					resObj["insertId"] = "0";
					resObj["rows"] = res;
				}
				return resObj;
			} catch (error) {
				db.end();
				throw new Error(error as any);
			}
		}
		return {
			execute,
			queryHistory: [],
			transaction: async (func: Function) => {
				await db.beginTransaction();
				const res = await func({ execute });
				await db.commit();
				return res;
			}
		}
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
			if (field.type === 'INT64' || field.type === 'UINT64') {
				return Number(value)
			}
			// if it's a boolean
			// if (field.type === 'INT8' && field.columnLength === 1) {
			// 	return value === 1
			// }
			return cast(field, value);
		},
	});
};
