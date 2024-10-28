import { createClient, type Client, type ResultSet, type Transaction as libsqlTransaction } from "@libsql/client";
import type { Insert } from "../types/entities";
import { Random as R } from "./random";
import { questionMarks } from "./utils.server";
export type ExecReturn<T> = { insertId: '0', rows: T[]; };
export type Exec = <T = undefined>(query: string, args?: QueryArguments, _?: any) => Promise<T extends undefined ? { insertId: string; } : ExecReturn<T>>;

export type QueryArguments = Record<string, any> | any[];

export type Transaction = {
	execute: Exec,
	executeQuery: <T = undefined>(query: string, args?: QueryArguments, log?: boolean) => Promise<T extends undefined ? Insert : T[]>,
	queryHistory: [{
		id: string;
		query: string;
		args: QueryArguments;
	}];
};

type TxConn = {
	tx: Transaction;
	conn: libsqlTransaction;
};

export type WrappedConnection = {
	execute: Exec,
	transaction: (func: (tx: Transaction) => any) => Promise<any>;
	close: () => void;
	isClosed: () => boolean;
};

type DBType = "sqlite-prod" | "sqlite-dev" | null;
export type SimpleConnection = Client;
type ConnectionType<ShouldWrap extends boolean> =
	ShouldWrap extends true ? WrappedConnection : SimpleConnection;

export function createDbConnection<T extends boolean = false>(type?: DBType, wrapper?: T): ConnectionType<T> {
	const {
		// Local snaphot env variables for development
		DEV_DB_ABSOLUTE_LOCATION,
		// Turso env variables for production
		TURSO_DB_URL, TURSO_DB_TOKEN,
		// Connector type
		CONNECTOR } = import.meta.env;

	// ! SQLITE does not support LIMIT in UPDATE queries
	let client: SimpleConnection = null as any;
	if (type === "sqlite-prod" || CONNECTOR === "sqlite-prod") {
		client = createClient({
			url: TURSO_DB_URL,
			authToken: TURSO_DB_TOKEN,
			intMode: "number",
		});
	} else if (type === "sqlite-dev" || CONNECTOR === "sqlite-dev") {
		client = createClient({
			url: `file://${DEV_DB_ABSOLUTE_LOCATION}`,
			intMode: "number",
		});
	} else {
		throw new Error("Database connector is not specified.");
	}

	if (client && wrapper) {
		const execute = function (clientHandler: libsqlTransaction | Client) {
			/**
			 * @throws {LibsqlError}
			 */
			return async function <T = undefined>(query: string, argsObj: QueryArguments = [], _?: any) {
				let res = await clientHandler.execute(sqlPreprocessor(query, argsObj)) as ResultSet;
				let resObj = {} as any;
				if (res.lastInsertRowid && !Number.isNaN(res.lastInsertRowid)) resObj.insertId = "" + res.lastInsertRowid;
				else {
					resObj.insertId = "0";
					resObj.rows = res.rows;
				}
				return resObj as T extends undefined ? { insertId: string; } : ExecReturn<T>;
			};
		};

		let txconn: TxConn = {} as any;
		return {
			execute: async <T>(query: string, args: QueryArguments = [], _?: any) => {
				try {
					let res = await execute(client)<T>(query, args);
					return res;
				} catch (err) {
					// console.log({ err });
					queryLogger({ id: R.link(20), query, args }, true);
					throw err;
				}
			},
			transaction: async (func) => {
				txconn.conn = await client.transaction("write");
				txconn.tx = {
					execute: execute(txconn.conn),
					queryHistory: [] as any,
					executeQuery: null as any
				};
				let res, hasError = false;
				try {
					res = await func(txconn.tx);
					await txconn.conn.commit();
				} catch (error) {
					await txconn.conn.rollback();
					hasError = true;
					throw error;
				} finally {
					client.close();
					txconn.tx.queryHistory.forEach(async (q) => {
						// console.log({ q });
						if (q.query.startsWith("SELECT")) return;
						await queryLogger(q, hasError);
					});
				}
				txconn = {} as any;
				return res;
			},
			close: () => {
				client.close();
			},
			isClosed(): boolean {
				return client.closed;
			}
		} as WrappedConnection as any;
	}
	return client as any;
};

const queryLogger = async ({ id, query, args }: Transaction["queryHistory"][number], err = false) => {
	query.length > 400 && (query = query.slice(0, 397) + "...");
	let argStr = JSON.stringify(Array.isArray(args) ? args : objectToArrayFromQuery(args, query));
	argStr.length > 400 && (argStr = argStr.slice(0, 397) + "...");
	try {
		createDbConnection().execute({
			sql: "INSERT INTO query_logs (id, query, args, error, date) VALUES (?, ?, ?, ?, ?)",
			args: [id, query, argStr, err ? 1 : 0, Date.now()]
		});
	} catch (error) {
		console.log("Query logger error:" + error);
	}
};


const sqlPreprocessor = (query: string, args: QueryArguments) => {
	const argsArr = Array.isArray(args) ? args : objectToArrayFromQuery(args, query);
	const sql = query.replace("???", questionMarks(argsArr.length));
	return { sql, args: argsArr };
};

const objectToArrayFromQuery = (obj: Record<string, any>, query: string) => {
	let argsArr = [] as any[];
	if (query.includes("VALUES")) {
		const fields = query.match(/\([_\-a-zA-Z ,]+\)/g);
		if (fields) {
			fields.forEach((field) => {
				const keys = field.slice(1, field.length - 1).split(", ");
				keys.forEach((key) => {
					argsArr.push(obj[key]);
				});
			});
		}
	} else {
		const fields = query.match(/([_\-a-zA-Z]+(<|>|!)?( )?(LIKE|=)( )?\?)/g);
		if (fields) {
			fields.forEach((field) => {
				const key = field.split("=")[0].trim();
				argsArr.push(obj[key]);
			});
		}
	}
	return argsArr;
};
