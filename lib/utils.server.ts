import type { DefaultEndpointResponse, EndpointResponse } from "../types/routes";
import { CreateDbConnection, type Transaction } from "./db";

/**
 *
 * @param arg
 * @returns Return the number of question marks needed for a query
 */
export const questionMarks = (arg: number | any[]) => Array.isArray(arg) ? "?".repeat(arg.length).split("").join(", ") : "?".repeat(arg).split("").join(", ");

export const createSessionId = (size = 32) => {
	const hexLookup = "0123456789abcdef";
	let session_id = "";
	for (let j = 0; j < size; j++) {
		session_id += hexLookup[Math.floor(Math.random() * 16)];
	}
	return { session_id, session_exp_date: Date.now() + 1000 * 60 * 60 * 24 * 7 };
};

export const generateLink = (size = 16) => {
	const linkLookup = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
	let link = "";
	for (let j = 0; j < size; j++) {
		link += linkLookup[Math.floor(Math.random() * 62)];
	}
	return link;
};

const queryLogger = async (queryId: string, query: string, args: any[]) => {
	query.length > 400 && (query = query.slice(0, 397) + "...");
	let argStr = JSON.stringify(args);
	argStr.length > 400 && (argStr = argStr.slice(0, 397) + "...");
	try {
		await (await CreateDbConnection()).execute("INSERT INTO query_logs (id, query, args, date) VALUES (?, ?, ?, ?)", [queryId, query, argStr, Date.now()]);
	} catch (error) {
		console.log(error);
	}
};

export const executeQuery = async <T = undefined>(query: string, args: any[] = [], tx?: Transaction, log = false) => {
	const conn = tx ?? await CreateDbConnection();
	let queryId, res;
	try {
		if (!query.startsWith("SELECT") || log) {
			queryId = generateLink(20);
			tx && tx.queryHistory.push(queryId);
			await queryLogger(queryId, query, args);
		}
		res = await conn.execute<T>(query, args, { as: "object" });
	} catch (error) {
		console.log(error);
		if (queryId) {
			const errConn = await CreateDbConnection();
			if (tx)
				await errConn.execute(`UPDATE query_logs SET error = ? WHERE id IN (${questionMarks(tx.queryHistory.length)})`, [true, ...tx.queryHistory]);
			else
				await errConn.execute("UPDATE query_logs SET error = ? WHERE id=?", [true, queryId]);
		}
		throw new Error(error as any);
	}
	return (res.insertId === "0" && 'rows' in res ? res.rows : { insertId: Number(res.insertId) }) as T extends undefined ? { insertId: number; } : T[];
};

export const execTryCatch = async <T>(
	func: (t: Transaction) => Promise<T>
): Promise<T extends string ? DefaultEndpointResponse : EndpointResponse<T>> => {
	// This is a work around because if I return inside the try-catch blocks, the return type is not inferred correctly
	let res: DefaultEndpointResponse | EndpointResponse<T>;
	const hasTransaction: boolean = func.length === 1;
	try {
		//@ts-ignore
		let response;
		if (hasTransaction) {
			let conn = await CreateDbConnection();
			response = await conn.transaction((tx) => {
				tx.queryHistory = [];
				tx.executeQuery = <T>(query: string, args?: any[], log = false) => executeQuery<T>(query, args, tx, log);
				return func(tx as Transaction) as Promise<T>;
			});
		} else {
			response = (await (func as () => Promise<T>)()) as T;
		}
		if (typeof response === "string") res = MessageWrapper(response);
		else res = DataWrapper(response);
	} catch (error: Error | any) {
		if (error instanceof Error) {
			res = { res: "error", error: { message: error?.message } };
		} else {
			res = { res: "error", error: { message: error } };
		}
	}
	return res as T extends string ? DefaultEndpointResponse : EndpointResponse<T>;
};

export const MessageWrapper = (msg: string) => {
	return { res: "message", message: msg } as DefaultEndpointResponse;
};

export const DataWrapper = <T = object>(data: T) => {
	return { res: "data", data } as EndpointResponse<T>;
};
